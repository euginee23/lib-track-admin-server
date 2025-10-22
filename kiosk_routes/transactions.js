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

module.exports = router;
