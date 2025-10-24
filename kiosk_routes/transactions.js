const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");

// GET ALL TRANSACTIONS
router.get("/", async (req, res) => {
  try {
    const { user_id, transaction_type } = req.query;

    let whereClause = "WHERE 1=1";
    let queryParams = [];

    if (user_id) {
      whereClause += " AND t.user_id = ?";
      queryParams.push(user_id);
    }

    if (transaction_type) {
      whereClause += " AND t.transaction_type = ?";
      queryParams.push(transaction_type);
    }

    // GET RESULTS
    const [transactions] = await pool.execute(
      `SELECT 
        t.*,
        u.first_name,
        u.last_name,
        u.email,
        u.student_id,
        u.year_level,
        u.position,
        d.department_name,
        d.department_acronym,
        b.book_title,
        b.book_cover,
        b.book_number,
        b.isUsingDepartment,
        CASE 
          WHEN b.isUsingDepartment = 1 THEN bd.department_name 
          ELSE bg.book_genre 
        END as book_genre,
        rp.research_title,
        rp.research_abstract,
        rd.department_name as research_department
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.user_id
      LEFT JOIN departments d ON u.department_id = d.department_id
      LEFT JOIN books b ON t.book_id = b.book_id
      LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
      LEFT JOIN departments bd ON b.book_genre_id = bd.department_id AND b.isUsingDepartment = 1
      LEFT JOIN research_papers rp ON t.research_paper_id = rp.research_paper_id
      LEFT JOIN departments rd ON rp.department_id = rd.department_id
      ${whereClause}
      ORDER BY t.transaction_date DESC`,
      queryParams
    );

    res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions
    });

  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
      error: error.message
    });
  }
});

// GET ONGOING TRANSACTIONS (borrowed/reserved items)
router.get("/ongoing", async (req, res) => {
  try {
    const { user_id, transaction_type } = req.query;

    let whereClause = "WHERE t.transaction_type IN ('borrow', 'reserve')";
    let queryParams = [];

    if (user_id) {
      whereClause += " AND t.user_id = ?";
      queryParams.push(user_id);
    }

    if (transaction_type) {
      whereClause += " AND t.transaction_type = ?";
      queryParams.push(transaction_type);
    }

    // GET RESULTS WITH CALCULATED STATUS
    const [transactions] = await pool.execute(
      `SELECT 
        t.*,
        u.first_name,
        u.last_name,
        u.email,
        u.student_id,
        u.year_level,
        u.position,
        d.department_name,
        d.department_acronym,
        b.book_title,
        b.book_cover,
        b.book_number,
        b.isUsingDepartment,
        CASE 
          WHEN b.isUsingDepartment = 1 THEN bd.department_name 
          ELSE bg.book_genre 
        END as book_genre,
        rp.research_title,
        rp.research_abstract,
        rd.department_name as research_department,
        CASE 
          WHEN t.transaction_type = 'reserve' THEN 'reserved'
          WHEN t.transaction_type = 'borrow' THEN 'borrowed'
          ELSE 'unknown'
        END as status,
        CASE 
          WHEN t.transaction_type = 'borrow' AND t.due_date IS NOT NULL 
          THEN DATEDIFF(STR_TO_DATE(t.due_date, '%Y-%m-%d'), CURDATE())
          ELSE NULL
        END as days_remaining
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.user_id
      LEFT JOIN departments d ON u.department_id = d.department_id
      LEFT JOIN books b ON t.book_id = b.book_id
      LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
      LEFT JOIN departments bd ON b.book_genre_id = bd.department_id AND b.isUsingDepartment = 1
      LEFT JOIN research_papers rp ON t.research_paper_id = rp.research_paper_id
      LEFT JOIN departments rd ON rp.department_id = rd.department_id
      ${whereClause}
      ORDER BY t.transaction_date DESC`,
      queryParams
    );

    res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions
    });

  } catch (error) {
    console.error("Error fetching ongoing transactions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch ongoing transactions",
      error: error.message
    });
  }
});

// GET TRANSACTION HISTORY (returned items)
router.get("/history", async (req, res) => {
  try {
    const { user_id } = req.query;

    let whereClause = "WHERE t.transaction_type = 'return'";
    let queryParams = [];

    if (user_id) {
      whereClause += " AND t.user_id = ?";
      queryParams.push(user_id);
    }

    // GET RESULTS
    const [transactions] = await pool.execute(
      `SELECT 
        t.*,
        u.first_name,
        u.last_name,
        u.email,
        u.student_id,
        u.year_level,
        u.position,
        d.department_name,
        d.department_acronym,
        b.book_title,
        b.book_cover,
        b.book_number,
        b.isUsingDepartment,
        CASE 
          WHEN b.isUsingDepartment = 1 THEN bd.department_name 
          ELSE bg.book_genre 
        END as book_genre,
        rp.research_title,
        rp.research_abstract,
        rd.department_name as research_department,
        'returned' as status,
        CASE 
          WHEN t.due_date IS NOT NULL AND STR_TO_DATE(t.due_date, '%Y-%m-%d') < DATE(t.transaction_date)
          THEN 'late'
          ELSE 'on_time'
        END as return_status,
        CASE 
          WHEN t.due_date IS NOT NULL AND STR_TO_DATE(t.due_date, '%Y-%m-%d') < DATE(t.transaction_date)
          THEN DATEDIFF(DATE(t.transaction_date), STR_TO_DATE(t.due_date, '%Y-%m-%d')) * 5
          ELSE 0
        END as fine
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.user_id
      LEFT JOIN departments d ON u.department_id = d.department_id
      LEFT JOIN books b ON t.book_id = b.book_id
      LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
      LEFT JOIN departments bd ON b.book_genre_id = bd.department_id AND b.isUsingDepartment = 1
      LEFT JOIN research_papers rp ON t.research_paper_id = rp.research_paper_id
      LEFT JOIN departments rd ON rp.department_id = rd.department_id
      ${whereClause}
      ORDER BY t.transaction_date DESC`,
      queryParams
    );

    res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions
    });

  } catch (error) {
    console.error("Error fetching transaction history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transaction history",
      error: error.message
    });
  }
});

// GET OVERDUE/DUE NOTIFICATIONS
router.get("/notifications", async (req, res) => {
  try {
    // GET OVERDUE AND DUE ITEMS
    const [transactions] = await pool.execute(
      `SELECT 
        t.*,
        u.first_name,
        u.last_name,
        u.email,
        u.student_id,
        u.year_level,
        u.position,
        d.department_name,
        d.department_acronym,
        b.book_title,
        b.book_cover,
        b.book_number,
        b.isUsingDepartment,
        CASE 
          WHEN b.isUsingDepartment = 1 THEN bd.department_name 
          ELSE bg.book_genre 
        END as book_genre,
        rp.research_title,
        rd.department_name as research_department,
        DATEDIFF(STR_TO_DATE(t.due_date, '%Y-%m-%d'), CURDATE()) as days_remaining,
        CASE 
          WHEN DATEDIFF(STR_TO_DATE(t.due_date, '%Y-%m-%d'), CURDATE()) < 0 THEN 'overdue'
          WHEN DATEDIFF(STR_TO_DATE(t.due_date, '%Y-%m-%d'), CURDATE()) = 0 THEN 'due_today'
          WHEN DATEDIFF(STR_TO_DATE(t.due_date, '%Y-%m-%d'), CURDATE()) = 1 THEN 'due_tomorrow'
          ELSE 'normal'
        END as notification_type
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.user_id
      LEFT JOIN departments d ON u.department_id = d.department_id
      LEFT JOIN books b ON t.book_id = b.book_id
      LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
      LEFT JOIN departments bd ON b.book_genre_id = bd.department_id AND b.isUsingDepartment = 1
      LEFT JOIN research_papers rp ON t.research_paper_id = rp.research_paper_id
      LEFT JOIN departments rd ON rp.department_id = rd.department_id
      WHERE t.transaction_type = 'borrow' 
        AND t.due_date IS NOT NULL
        AND DATEDIFF(STR_TO_DATE(t.due_date, '%Y-%m-%d'), CURDATE()) <= 1
      ORDER BY days_remaining ASC, t.transaction_date DESC`
    );

    res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions
    });

  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      error: error.message
    });
  }
});

// GET TRANSACTION BY ID
router.get("/:transaction_id", async (req, res) => {
  try {
    const { transaction_id } = req.params;

    const [transactions] = await pool.execute(
      `SELECT 
        t.*,
        u.first_name,
        u.last_name,
        u.email,
        u.student_id,
        u.year_level,
        u.position,
        d.department_name,
        d.department_acronym,
        b.book_title,
        b.book_cover,
        b.book_number,
        b.isUsingDepartment,
        CASE 
          WHEN b.isUsingDepartment = 1 THEN bd.department_name 
          ELSE bg.book_genre 
        END as book_genre,
        rp.research_title,
        rp.research_abstract,
        rd.department_name as research_department
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.user_id
      LEFT JOIN departments d ON u.department_id = d.department_id
      LEFT JOIN books b ON t.book_id = b.book_id
      LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
      LEFT JOIN departments bd ON b.book_genre_id = bd.department_id AND b.isUsingDepartment = 1
      LEFT JOIN research_papers rp ON t.research_paper_id = rp.research_paper_id
      LEFT JOIN departments rd ON rp.department_id = rd.department_id
      WHERE t.transaction_id = ?
      LIMIT 1`,
      [transaction_id]
    );

    if (transactions.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found"
      });
    }

    res.status(200).json({
      success: true,
      data: transactions[0]
    });

  } catch (error) {
    console.error("Error fetching transaction:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transaction",
      error: error.message
    });
  }
});

// GET TRANSACTIONS BY USER ID
router.get("/user/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    const [transactions] = await pool.execute(
      `SELECT 
        t.*,
        u.first_name,
        u.last_name,
        u.email,
        u.student_id,
        u.year_level,
        u.position,
        d.department_name,
        d.department_acronym,
        b.book_title,
        b.book_cover,
        b.book_number,
        b.isUsingDepartment,
        -- computed book authors (if stored as multiple rows or as a single comma-separated value)
        (SELECT GROUP_CONCAT(ba2.book_author SEPARATOR ', ') FROM book_author ba2 WHERE ba2.book_author_id = b.book_author_id) AS book_authors,
        CASE 
          WHEN b.isUsingDepartment = 1 THEN bd.department_name 
          ELSE bg.book_genre 
        END as book_genre,
        rp.research_title,
        rp.research_abstract,
        -- computed research paper authors (concatenate multiple author rows if present)
        (SELECT GROUP_CONCAT(ra2.author_name SEPARATOR ', ') FROM research_author ra2 WHERE ra2.research_paper_id = rp.research_paper_id) AS research_authors,
        rd.department_name as research_department,
        CASE
          WHEN t.transaction_type = 'reserve' THEN 'reserved'
          WHEN t.transaction_type = 'borrow' THEN 'borrowed'
          WHEN t.transaction_type = 'return' THEN 'returned'
          ELSE t.transaction_type
        END as status
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.user_id
      LEFT JOIN departments d ON u.department_id = d.department_id
      LEFT JOIN books b ON t.book_id = b.book_id
      LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
      LEFT JOIN departments bd ON b.book_genre_id = bd.department_id AND b.isUsingDepartment = 1
      LEFT JOIN research_papers rp ON t.research_paper_id = rp.research_paper_id
      LEFT JOIN departments rd ON rp.department_id = rd.department_id
      WHERE t.user_id = ?
      ORDER BY t.transaction_date DESC`,
      [user_id]
    );

    res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions
    });

  } catch (error) {
    console.error("Error fetching transactions for user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transactions for user",
      error: error.message
    });
  }
});

// GET COUNT USER BORROWED TRANSACTIONS
router.get("/stats/borrowed/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    const [result] = await pool.execute(
      `SELECT 
        COUNT(*) as total_borrowed,
        COUNT(CASE WHEN t.transaction_type = 'borrow' THEN 1 END) as active_borrowed,
        COUNT(CASE WHEN t.transaction_type = 'return' THEN 1 END) as returned_count,
        COUNT(CASE WHEN t.transaction_type = 'reserve' THEN 1 END) as reserved_count
      FROM transactions t
      WHERE t.user_id = ?`,
      [user_id]
    );

    // Get overdue count
    const [overdueResult] = await pool.execute(
      `SELECT COUNT(*) as overdue_count
      FROM transactions t
      WHERE t.user_id = ? 
        AND t.transaction_type = 'borrow'
        AND t.due_date IS NOT NULL
        AND STR_TO_DATE(t.due_date, '%Y-%m-%d') < CURDATE()`,
      [user_id]
    );

    res.status(200).json({
      success: true,
      data: {
        user_id,
        total_borrowed: result[0].total_borrowed,
        active_borrowed: result[0].active_borrowed,
        returned_count: result[0].returned_count,
        reserved_count: result[0].reserved_count,
        overdue_count: overdueResult[0].overdue_count
      }
    });

  } catch (error) {
    console.error("Error fetching user borrowed stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user borrowed statistics",
      error: error.message
    });
  }
});

// GET COUNT USER PENDING PENALTY
router.get("/stats/penalties/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    const [result] = await pool.execute(
      `SELECT 
        COUNT(*) as total_penalties,
        COUNT(CASE WHEN p.fine > 0 THEN 1 END) as pending_penalties,
        COUNT(CASE WHEN p.fine = 0 THEN 1 END) as paid_penalties,
        SUM(CASE WHEN p.fine > 0 THEN p.fine ELSE 0 END) as total_pending_amount
      FROM penalties p
      WHERE p.user_id = ?`,
      [user_id]
    );

    // Get recent penalties (last 30 days)
    const [recentResult] = await pool.execute(
      `SELECT COUNT(*) as recent_penalties
      FROM penalties p
      WHERE p.user_id = ? 
        AND p.updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [user_id]
    );

    res.status(200).json({
      success: true,
      data: {
        user_id,
        total_penalties: result[0].total_penalties || 0,
        pending_penalties: result[0].pending_penalties || 0,
        paid_penalties: result[0].paid_penalties || 0,
        total_pending_amount: result[0].total_pending_amount || 0,
        recent_penalties: recentResult[0].recent_penalties || 0
      }
    });

  } catch (error) {
    console.error("Error fetching user penalty stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user penalty statistics",
      error: error.message
    });
  }
});

// GET TOTAL USER FINES
router.get("/stats/fines/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    // Get fine statistics from penalties table
    const [penaltyResult] = await pool.execute(
      `SELECT 
        SUM(CASE WHEN p.fine > 0 THEN p.fine ELSE 0 END) as total_unpaid_fines,
        SUM(p.fine) as total_fines_ever,
        COUNT(CASE WHEN p.fine > 0 THEN 1 END) as unpaid_penalty_count,
        MAX(p.updated_at) as last_penalty_date
      FROM penalties p
      WHERE p.user_id = ?`,
      [user_id]
    );

    // Get overdue transaction details for current calculations
    const [overdueResult] = await pool.execute(
      `SELECT 
        COUNT(*) as overdue_transactions,
        AVG(DATEDIFF(CURDATE(), STR_TO_DATE(t.due_date, '%Y-%m-%d'))) as avg_overdue_days
      FROM transactions t
      WHERE t.user_id = ? 
        AND t.transaction_type = 'borrow'
        AND t.due_date IS NOT NULL
        AND STR_TO_DATE(t.due_date, '%Y-%m-%d') < CURDATE()`,
      [user_id]
    );

    // Get user type for fine calculation context
    const [userResult] = await pool.execute(
      `SELECT position FROM users WHERE user_id = ?`,
      [user_id]
    );

    const isStudent = !userResult[0]?.position || userResult[0].position === 'Student';

    res.status(200).json({
      success: true,
      data: {
        user_id,
        user_type: isStudent ? 'student' : 'faculty',
        total_unpaid_fines: penaltyResult[0].total_unpaid_fines || 0,
        total_fines_ever: penaltyResult[0].total_fines_ever || 0,
        unpaid_penalty_count: penaltyResult[0].unpaid_penalty_count || 0,
        overdue_transactions: overdueResult[0].overdue_transactions || 0,
        avg_overdue_days: Math.round(overdueResult[0].avg_overdue_days || 0),
        last_penalty_date: penaltyResult[0].last_penalty_date || null,
        fine_status: penaltyResult[0].total_unpaid_fines > 0 ? 'has_fines' : 'no_fines'
      }
    });

  } catch (error) {
    console.error("Error fetching user fine stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user fine statistics",
      error: error.message
    });
  }
});

module.exports = router;
