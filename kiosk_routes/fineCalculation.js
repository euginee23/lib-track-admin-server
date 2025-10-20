const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");

// UNDEFINED VALUE SQL PARAMS HELPER
function safe(val) {
  return val === undefined ? null : val;
}

// GET SYSTEM SETTINGS FOR FINE CALCULATION
const getSystemSettings = async () => {
  try {
    const [settings] = await pool.execute(
      `SELECT 
        student_daily_fine,
        faculty_daily_fine,
        student_borrow_days,
        faculty_borrow_days
       FROM system_settings 
       LIMIT 1`
    );
    
    if (settings.length === 0) {
      // Default settings if none found
      return {
        student_daily_fine: 5,
        faculty_daily_fine: 11,
        student_borrow_days: 3,
        faculty_borrow_days: 90
      };
    }
    
    return settings[0];
  } catch (error) {
    console.error("Error fetching system settings:", error);
    // Return default values on error
    return {
      student_daily_fine: 5,
      faculty_daily_fine: 11,
      student_borrow_days: 3,
      faculty_borrow_days: 90
    };
  }
};

// CALCULATE FINE FOR A SINGLE TRANSACTION
const calculateTransactionFine = async (transaction, systemSettings = null) => {
  try {
    // Get system settings if not provided
    if (!systemSettings) {
      systemSettings = await getSystemSettings();
    }

    // Check if transaction has due date
    if (!transaction.due_date) {
      return {
        fine: 0,
        daysOverdue: 0,
        status: 'no_due_date',
        message: 'No due date set for this transaction'
      };
    }

    // Parse due date
    const dueDate = new Date(transaction.due_date);
    const currentDate = new Date();
    
    // Calculate days difference
    const timeDifference = currentDate.getTime() - dueDate.getTime();
    const daysDifference = Math.ceil(timeDifference / (1000 * 3600 * 24));

    // If not overdue, no fine
    if (daysDifference <= 0) {
      return {
        fine: 0,
        daysOverdue: 0,
        status: 'on_time',
        message: 'Item not overdue'
      };
    }

    // Determine if user is student or faculty based on position
    const isStudent = !transaction.position || transaction.position === 'Student';
    const dailyFine = isStudent ? systemSettings.student_daily_fine : systemSettings.faculty_daily_fine;
    
    // Calculate total fine
    const totalFine = daysDifference * dailyFine;

    return {
      fine: totalFine,
      daysOverdue: daysDifference,
      dailyFine: dailyFine,
      userType: isStudent ? 'student' : 'faculty',
      status: 'overdue',
      message: `${daysDifference} day${daysDifference > 1 ? 's' : ''} overdue at ₱${dailyFine}/day`
    };

  } catch (error) {
    console.error("Error calculating transaction fine:", error);
    return {
      fine: 0,
      daysOverdue: 0,
      status: 'error',
      message: 'Error calculating fine',
      error: error.message
    };
  }
};

// CALCULATE FINES FOR USER'S TRANSACTIONS
router.get("/user/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    // Get system settings
    const systemSettings = await getSystemSettings();

    // Get user's ongoing transactions (borrowed items)
    const [transactions] = await pool.execute(
      `SELECT 
        t.*,
        u.first_name,
        u.last_name,
        u.position,
        u.year_level,
        d.department_name,
        d.department_acronym,
        b.book_title,
        rp.research_title
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.user_id
      LEFT JOIN departments d ON u.department_id = d.department_id
      LEFT JOIN books b ON t.book_id = b.book_id
      LEFT JOIN research_papers rp ON t.research_paper_id = rp.research_paper_id
      WHERE t.user_id = ? 
        AND t.transaction_type = 'borrow'
        AND t.due_date IS NOT NULL
      ORDER BY t.due_date ASC`,
      [user_id]
    );

    if (transactions.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No borrowed items found for this user",
        data: {
          user_id,
          total_fine: 0,
          total_overdue_items: 0,
          transactions: []
        }
      });
    }

    // Calculate fines for each transaction
    const transactionsWithFines = [];
    let totalFine = 0;
    let totalOverdueItems = 0;

    for (const transaction of transactions) {
      const fineCalculation = await calculateTransactionFine(transaction, systemSettings);
      
      const transactionWithFine = {
        ...transaction,
        ...fineCalculation,
        item_title: transaction.book_title || transaction.research_title || 'Unknown Item',
        user_name: `${transaction.first_name} ${transaction.last_name}`
      };

      transactionsWithFines.push(transactionWithFine);
      
      totalFine += fineCalculation.fine;
      if (fineCalculation.status === 'overdue') {
        totalOverdueItems++;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        user_id,
        user_name: transactionsWithFines[0]?.user_name || 'Unknown User',
        user_type: transactionsWithFines[0]?.userType || 'student',
        department: transactionsWithFines[0]?.department_acronym || 'N/A',
        total_fine: totalFine,
        total_overdue_items: totalOverdueItems,
        total_borrowed_items: transactions.length,
        system_settings: {
          student_daily_fine: systemSettings.student_daily_fine,
          faculty_daily_fine: systemSettings.faculty_daily_fine
        },
        transactions: transactionsWithFines
      }
    });

  } catch (error) {
    console.error("Error calculating user fines:", error);
    res.status(500).json({
      success: false,
      message: "Failed to calculate user fines",
      error: error.message
    });
  }
});

// CALCULATE FINE FOR SPECIFIC TRANSACTION
router.get("/transaction/:transaction_id", async (req, res) => {
  try {
    const { transaction_id } = req.params;

    // Get transaction details
    const [transactions] = await pool.execute(
      `SELECT 
        t.*,
        u.first_name,
        u.last_name,
        u.position,
        u.year_level,
        d.department_name,
        d.department_acronym,
        b.book_title,
        rp.research_title
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.user_id
      LEFT JOIN departments d ON u.department_id = d.department_id
      LEFT JOIN books b ON t.book_id = b.book_id
      LEFT JOIN research_papers rp ON t.research_paper_id = rp.research_paper_id
      WHERE t.transaction_id = ?`,
      [transaction_id]
    );

    if (transactions.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found"
      });
    }

    const transaction = transactions[0];
    
    // Calculate fine
    const fineCalculation = await calculateTransactionFine(transaction);
    
    const result = {
      ...transaction,
      ...fineCalculation,
      item_title: transaction.book_title || transaction.research_title || 'Unknown Item',
      user_name: `${transaction.first_name} ${transaction.last_name}`
    };

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error("Error calculating transaction fine:", error);
    res.status(500).json({
      success: false,
      message: "Failed to calculate transaction fine",
      error: error.message
    });
  }
});

// GET ALL OVERDUE TRANSACTIONS WITH FINES
router.get("/overdue", async (req, res) => {
  try {
    const { department_id, user_type } = req.query;

    // Get system settings
    const systemSettings = await getSystemSettings();

    // Build query conditions
    let whereClause = "WHERE t.transaction_type = 'borrow' AND t.due_date IS NOT NULL AND STR_TO_DATE(t.due_date, '%Y-%m-%d') < CURDATE()";
    let queryParams = [];

    if (department_id) {
      whereClause += " AND u.department_id = ?";
      queryParams.push(department_id);
    }

    if (user_type) {
      if (user_type === 'student') {
        whereClause += " AND (u.position IS NULL OR u.position = 'Student')";
      } else {
        whereClause += " AND u.position IS NOT NULL AND u.position != 'Student'";
      }
    }

    // Get overdue transactions
    const [transactions] = await pool.execute(
      `SELECT 
        t.*,
        u.first_name,
        u.last_name,
        u.position,
        u.year_level,
        d.department_name,
        d.department_acronym,
        b.book_title,
        rp.research_title
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.user_id
      LEFT JOIN departments d ON u.department_id = d.department_id
      LEFT JOIN books b ON t.book_id = b.book_id
      LEFT JOIN research_papers rp ON t.research_paper_id = rp.research_paper_id
      ${whereClause}
      ORDER BY t.due_date ASC`,
      queryParams
    );

    // Calculate fines for each transaction
    const overdueWithFines = [];
    let totalFines = 0;

    for (const transaction of transactions) {
      const fineCalculation = await calculateTransactionFine(transaction, systemSettings);
      
      const transactionWithFine = {
        ...transaction,
        ...fineCalculation,
        item_title: transaction.book_title || transaction.research_title || 'Unknown Item',
        user_name: `${transaction.first_name} ${transaction.last_name}`
      };

      overdueWithFines.push(transactionWithFine);
      totalFines += fineCalculation.fine;
    }

    // Group by user for summary
    const userSummaries = {};
    overdueWithFines.forEach(transaction => {
      const userId = transaction.user_id;
      if (!userSummaries[userId]) {
        userSummaries[userId] = {
          user_id: userId,
          user_name: transaction.user_name,
          user_type: transaction.userType,
          department: transaction.department_acronym,
          total_fine: 0,
          overdue_items: 0,
          transactions: []
        };
      }
      
      userSummaries[userId].total_fine += transaction.fine;
      userSummaries[userId].overdue_items++;
      userSummaries[userId].transactions.push(transaction);
    });

    res.status(200).json({
      success: true,
      data: {
        summary: {
          total_overdue_transactions: overdueWithFines.length,
          total_fines: totalFines,
          unique_users: Object.keys(userSummaries).length
        },
        system_settings: {
          student_daily_fine: systemSettings.student_daily_fine,
          faculty_daily_fine: systemSettings.faculty_daily_fine
        },
        user_summaries: Object.values(userSummaries),
        transactions: overdueWithFines
      }
    });

  } catch (error) {
    console.error("Error getting overdue transactions with fines:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get overdue transactions with fines",
      error: error.message
    });
  }
});

// UPDATE SYSTEM FINE SETTINGS
router.put("/settings", async (req, res) => {
  try {
    const { student_daily_fine, faculty_daily_fine } = req.body;

    if (student_daily_fine === undefined && faculty_daily_fine === undefined) {
      return res.status(400).json({
        success: false,
        message: "At least one fine setting must be provided"
      });
    }

    const updateFields = [];
    const updateValues = [];

    if (student_daily_fine !== undefined) {
      updateFields.push("student_daily_fine = ?");
      updateValues.push(student_daily_fine);
    }

    if (faculty_daily_fine !== undefined) {
      updateFields.push("faculty_daily_fine = ?");
      updateValues.push(faculty_daily_fine);
    }

    // Update system settings
    await pool.execute(
      `UPDATE system_settings SET ${updateFields.join(", ")}`,
      updateValues
    );

    res.status(200).json({
      success: true,
      message: "Fine settings updated successfully",
      data: {
        student_daily_fine,
        faculty_daily_fine
      }
    });

  } catch (error) {
    console.error("Error updating fine settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update fine settings",
      error: error.message
    });
  }
});

module.exports = router;
