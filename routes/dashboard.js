const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// GET /api/dashboard/analytics - Get comprehensive analytics for dashboard
router.get('/analytics', async (req, res) => {
  try {
    const { period = 'all' } = req.query; // 'daily', 'weekly', 'monthly', 'all'

    // prepare dateCondition early so it can be used by subsequent queries
    let dateCondition = '';
    switch(period) {
      case 'daily':
        dateCondition = "DATE(t.transaction_date) = CURDATE()";
        break;
      case 'weekly':
        dateCondition = "YEARWEEK(t.transaction_date, 1) = YEARWEEK(CURDATE(), 1)";
        break;
      case 'monthly':
        dateCondition = "YEAR(t.transaction_date) = YEAR(CURDATE()) AND MONTH(t.transaction_date) = MONTH(CURDATE())";
        break;
      default:
        dateCondition = '1=1';
    }

    // 1. Overdue Books and Fines Analytics (apply period filter)
    // Count overdue items based on missing return_date so we include transactions
    // where `status` may be NULL (older inserts didn't set status). This treats
    // any transaction without a return_date as active and thus eligible to be overdue.
    const [overdueStats] = await pool.execute(`
      SELECT 
        COUNT(DISTINCT t.transaction_id) as overdue_count,
        SUM(CASE 
          WHEN DATEDIFF(CURDATE(), STR_TO_DATE(t.due_date, '%Y-%m-%d')) > 0 
          THEN DATEDIFF(CURDATE(), STR_TO_DATE(t.due_date, '%Y-%m-%d'))
          ELSE 0 
        END) as total_overdue_days,
        COUNT(DISTINCT t.user_id) as users_with_overdue
      FROM transactions t
      WHERE (t.return_date IS NULL)
        AND t.due_date IS NOT NULL
        AND STR_TO_DATE(t.due_date, '%Y-%m-%d') < CURDATE()
        AND (${dateCondition})
    `);

    // 2. Fines Collected
    // 2. Fines Collected (apply period filter via linked transactions)
    const [finesStats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_paid_penalties,
        SUM(p.fine) as total_fines_collected,
        AVG(p.fine) as average_fine
      FROM penalties p
      LEFT JOIN transactions t ON p.transaction_id = t.transaction_id
      WHERE p.status = 'Paid'
        AND (${dateCondition})
    `);

    // 2b. Pending / Collectable fines (total outstanding across system)
    const [pendingStats] = await pool.execute(`
      SELECT
        COUNT(*) as total_unpaid_penalties,
        SUM(CASE WHEN p.fine > 0 THEN p.fine ELSE 0 END) as total_unpaid_fines
      FROM penalties p
      WHERE (p.status IS NULL OR p.status != 'Paid')
    `);

    // 3. User Session Analytics (active users by period)
    const [userSessions] = await pool.execute(`
      SELECT 
        COUNT(DISTINCT t.user_id) as active_users,
        COUNT(DISTINCT CASE WHEN u.position = 'Student' OR u.position IS NULL THEN t.user_id END) as student_users,
        COUNT(DISTINCT CASE WHEN u.position != 'Student' AND u.position IS NOT NULL THEN t.user_id END) as faculty_users,
        COUNT(t.transaction_id) as total_transactions
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.user_id
      WHERE ${dateCondition}
    `);

    // 4. Top Borrowing Department
    // 4. Top Borrowing Department (apply period filter)
    const [topDepartments] = await pool.execute(`
      SELECT 
        d.department_name,
        d.department_acronym,
        COUNT(t.transaction_id) as borrow_count,
        COUNT(DISTINCT t.user_id) as unique_borrowers,
        COUNT(DISTINCT CASE WHEN u.position = 'Student' OR u.position IS NULL THEN t.user_id END) as student_count,
        COUNT(DISTINCT CASE WHEN u.position != 'Student' AND u.position IS NOT NULL THEN t.user_id END) as faculty_count
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.user_id
      LEFT JOIN departments d ON u.department_id = d.department_id
      WHERE d.department_id IS NOT NULL
        AND (${dateCondition})
      GROUP BY d.department_id, d.department_name, d.department_acronym
      ORDER BY borrow_count DESC
      LIMIT 10
    `);

    // 5. Top Student Borrowers
    // 5. Top Student Borrowers (apply period filter)
    const [topBorrowers] = await pool.execute(`
      SELECT 
        u.user_id,
        CONCAT(u.first_name, ' ', u.last_name) as full_name,
        u.student_id,
        u.faculty_id,
        u.position,
        d.department_acronym,
        u.year_level,
        -- choose the best identifier: user.student_id -> user.faculty_id -> user.user_id
        COALESCE(u.student_id, u.faculty_id, u.user_id) AS user_identifier,
        COUNT(t.transaction_id) as borrow_count,
        COUNT(CASE WHEN t.return_date IS NULL THEN 1 END) as currently_borrowed,
          COUNT(CASE WHEN t.return_date IS NOT NULL THEN 1 END) as returned_count,
        MAX(t.transaction_date) as last_borrow_date
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.user_id
      LEFT JOIN departments d ON u.department_id = d.department_id
      WHERE u.user_id IS NOT NULL
        AND (${dateCondition})
      GROUP BY u.user_id, u.first_name, u.last_name, u.student_id, u.faculty_id, u.position, d.department_acronym, u.year_level
      ORDER BY borrow_count DESC
      LIMIT 10
    `);

    // 6. Monthly Trend Data (last 6 months) - ensure months with zero values are included
    const [monthlyTrend] = await pool.execute(`
      WITH months AS (
        SELECT DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL seq.n MONTH), '%Y-%m') AS month,
               DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL seq.n MONTH), '%b %Y') AS month_label
        FROM (
          SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2
          UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
        ) seq
      )
      SELECT m.month, m.month_label,
             COALESCE(t.transaction_count, 0) AS transaction_count,
             COALESCE(t.unique_users, 0) AS unique_users
      FROM months m
      LEFT JOIN (
        SELECT DATE_FORMAT(transaction_date, '%Y-%m') AS month,
               COUNT(*) AS transaction_count,
               COUNT(DISTINCT user_id) AS unique_users
        FROM transactions
        WHERE transaction_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY DATE_FORMAT(transaction_date, '%Y-%m')
      ) t ON t.month = m.month
      ORDER BY m.month ASC
    `);

    // 7. Overdue and Fines Trend (last 6 months)
    const [overdueFineTrend] = await pool.execute(`
      WITH months AS (
        SELECT DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL seq.n MONTH), '%Y-%m') AS month,
               DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL seq.n MONTH), '%b %Y') AS month_label
        FROM (
          SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2
          UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
        ) seq
      )
      SELECT 
        m.month, 
        m.month_label,
        COALESCE(overdue.overdue_count, 0) AS overdue_count,
        COALESCE(fines.fines_collected, 0) AS fines_collected
      FROM months m
      LEFT JOIN (
        SELECT 
          DATE_FORMAT(t.transaction_date, '%Y-%m') AS month,
          COUNT(DISTINCT t.transaction_id) AS overdue_count
        FROM transactions t
        WHERE t.return_date IS NULL
          AND t.due_date IS NOT NULL
          AND STR_TO_DATE(t.due_date, '%Y-%m-%d') < CURDATE()
          AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY DATE_FORMAT(t.transaction_date, '%Y-%m')
      ) overdue ON overdue.month = m.month
      LEFT JOIN (
        SELECT 
          DATE_FORMAT(t.transaction_date, '%Y-%m') AS month,
          SUM(p.fine) AS fines_collected
        FROM penalties p
        LEFT JOIN transactions t ON p.transaction_id = t.transaction_id
        WHERE p.status = 'Paid'
          AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY DATE_FORMAT(t.transaction_date, '%Y-%m')
      ) fines ON fines.month = m.month
      ORDER BY m.month ASC
    `);

    // 8. Total Books and Research Papers Count
    const [booksCount] = await pool.execute(`
      SELECT COUNT(DISTINCT batch_registration_key) as total_books,
             COUNT(*) as total_book_copies
      FROM books
    `);

    const [researchCount] = await pool.execute(`
      SELECT COUNT(*) as total_research
      FROM research_papers
    `);

    // 9. Top Borrowed Authors
    const [topAuthors] = await pool.execute(`
      SELECT 
        ba.book_author as author,
        COUNT(t.transaction_id) as borrow_count,
        COUNT(DISTINCT t.user_id) as unique_borrowers
      FROM transactions t
      INNER JOIN books b ON t.book_id = b.book_id
      LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
      WHERE ba.book_author IS NOT NULL AND ba.book_author != ''
        AND (${dateCondition})
      GROUP BY ba.book_author_id, ba.book_author
      ORDER BY borrow_count DESC
      LIMIT 10
    `);

    // 10. Top Borrowed Genres
    const [topGenres] = await pool.execute(`
      SELECT 
        CASE 
          WHEN b.isUsingDepartment = 1 THEN d.department_name
          ELSE bg.book_genre
        END as genre,
        COUNT(t.transaction_id) as borrow_count,
        COUNT(DISTINCT t.user_id) as unique_borrowers
      FROM transactions t
      INNER JOIN books b ON t.book_id = b.book_id
      LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
      LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
      WHERE (bg.book_genre IS NOT NULL OR d.department_name IS NOT NULL)
        AND (${dateCondition})
      GROUP BY genre
      ORDER BY borrow_count DESC
      LIMIT 10
    `);

    // 11. Pending Registration Approvals
    const [pendingRegistrations] = await pool.execute(`
      SELECT 
        COUNT(*) as total_pending,
        COUNT(CASE WHEN position = 'Student' OR position IS NULL THEN 1 END) as student_pending,
        COUNT(CASE WHEN position != 'Student' AND position IS NOT NULL THEN 1 END) as faculty_pending
      FROM users
      WHERE librarian_approval = 0 OR librarian_approval IS NULL
    `);

    res.json({
      success: true,
      data: {
        overdue: {
          count: overdueStats[0]?.overdue_count || 0,
          totalDays: overdueStats[0]?.total_overdue_days || 0,
          affectedUsers: overdueStats[0]?.users_with_overdue || 0
        },
        fines: {
          totalCollected: parseFloat(finesStats[0]?.total_fines_collected || 0),
          totalPenalties: finesStats[0]?.total_paid_penalties || 0,
          averageFine: parseFloat(finesStats[0]?.average_fine || 0),
          collectable: parseFloat(pendingStats[0]?.total_unpaid_fines || 0),
          unpaidPenalties: pendingStats[0]?.total_unpaid_penalties || 0
        },
        userSessions: {
          period,
          activeUsers: userSessions[0]?.active_users || 0,
          students: userSessions[0]?.student_users || 0,
          faculty: userSessions[0]?.faculty_users || 0,
          transactions: userSessions[0]?.total_transactions || 0
        },
        topDepartments: topDepartments || [],
        topBorrowers: topBorrowers || [],
        monthlyTrend: monthlyTrend || [],
        overdueFineTrend: overdueFineTrend || [],
        collectionStats: {
          totalBooks: booksCount[0]?.total_books || 0,
          totalBookCopies: booksCount[0]?.total_book_copies || 0,
          totalResearch: researchCount[0]?.total_research || 0,
          totalItems: (booksCount[0]?.total_books || 0) + (researchCount[0]?.total_research || 0)
        },
        topAuthors: topAuthors || [],
        topGenres: topGenres || [],
        pendingRegistrations: {
          total: pendingRegistrations[0]?.total_pending || 0,
          students: pendingRegistrations[0]?.student_pending || 0,
          faculty: pendingRegistrations[0]?.faculty_pending || 0
        }
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard analytics',
      message: error.message
    });
  }
});

// GET /api/dashboard/stats - Get dashboard statistics
router.get('/stats', (req, res) => {
  try {
    const data = getAllItems();
    const allItems = [...data.books, ...data.research];

    // Calculate statistics
    const totalBooks = data.books.length;
    const totalResearch = data.research.length;
    const totalItems = allItems.length;
    const totalCopies = allItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalValue = data.books.reduce((sum, book) => sum + (book.price || 0), 0);

    // Books by genre
    const genreStats = data.books.reduce((acc, book) => {
      const genre = book.genre || 'Unknown';
      acc[genre] = (acc[genre] || 0) + 1;
      return acc;
    }, {});

    // Research by department
    const departmentStats = data.research.reduce((acc, paper) => {
      const dept = paper.department || 'Unknown';
      acc[dept] = (acc[dept] || 0) + 1;
      return acc;
    }, {});

    // Recent additions (last 30 days simulation)
    const recentItems = allItems.slice(-5); // Get last 5 items as "recent"

    // Items by year
    const yearStats = allItems.reduce((acc, item) => {
      const year = item.year || 'Unknown';
      acc[year] = (acc[year] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        overview: {
          totalBooks,
          totalResearch,
          totalItems,
          totalCopies,
          totalValue: totalValue.toFixed(2)
        },
        distribution: {
          byType: {
            books: totalBooks,
            research: totalResearch
          },
          byGenre: genreStats,
          byDepartment: departmentStats,
          byYear: yearStats
        },
        recent: recentItems.map(item => ({
          id: item.id,
          type: item.type,
          title: item.title,
          author: item.author,
          addedDate: new Date().toISOString() // Simulated
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard statistics',
      message: error.message
    });
  }
});

// GET /api/dashboard/summary - Get summary data for dashboard cards
router.get('/summary', (req, res) => {
  try {
    const data = getAllItems();
    const allItems = [...data.books, ...data.research];

    const summary = {
      totalCollection: allItems.length,
      totalBooks: data.books.length,
      totalResearch: data.research.length,
      totalCopies: allItems.reduce((sum, item) => sum + (item.quantity || 0), 0),
      totalValue: data.books.reduce((sum, book) => sum + (book.price || 0), 0),
      availableItems: allItems.filter(item => (item.quantity || 0) > 0).length,
      recentlyAdded: allItems.slice(-10).length // Last 10 items
    };

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard summary',
      message: error.message
    });
  }
});

// GET /api/dashboard/charts - Get data for dashboard charts
router.get('/charts', (req, res) => {
  try {
    const data = getAllItems();
    const allItems = [...data.books, ...data.research];

    // Monthly additions (simulated data)
    const monthlyData = [
      { month: 'Jan', books: 5, research: 2 },
      { month: 'Feb', books: 8, research: 3 },
      { month: 'Mar', books: 12, research: 4 },
      { month: 'Apr', books: 6, research: 1 },
      { month: 'May', books: 9, research: 5 },
      { month: 'Jun', books: 11, research: 3 }
    ];

    // Genre distribution
    const genreData = data.books.reduce((acc, book) => {
      const genre = book.genre || 'Unknown';
      const existing = acc.find(item => item.name === genre);
      if (existing) {
        existing.value += 1;
      } else {
        acc.push({ name: genre, value: 1 });
      }
      return acc;
    }, []);

    // Department distribution
    const departmentData = data.research.reduce((acc, paper) => {
      const dept = paper.department || 'Unknown';
      const existing = acc.find(item => item.name === dept);
      if (existing) {
        existing.value += 1;
      } else {
        acc.push({ name: dept, value: 1 });
      }
      return acc;
    }, []);

    res.json({
      success: true,
      data: {
        monthlyAdditions: monthlyData,
        genreDistribution: genreData,
        departmentDistribution: departmentData,
        typeDistribution: [
          { name: 'Books', value: data.books.length },
          { name: 'Research Papers', value: data.research.length }
        ]
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard charts data',
      message: error.message
    });
  }
});

module.exports = router;
