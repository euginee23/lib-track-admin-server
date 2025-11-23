const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");

// WebSocket instance (will be set from server.js)
let wsServer = null;

// Function to set WebSocket server instance
router.setWebSocketServer = (ws) => {
  wsServer = ws;
};

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
      return {
        student_daily_fine: 5,
        faculty_daily_fine: 11,
        student_borrow_days: 3,
        faculty_borrow_days: 90,
      };
    }

    return settings[0];
  } catch (error) {
    console.error("Error fetching system settings:", error);
    return {
      student_daily_fine: 5,
      faculty_daily_fine: 11,
      student_borrow_days: 3,
      faculty_borrow_days: 90,
    };
  }
};

// GET PENALTY RECORD (check for existing unpaid penalty with Pending Payment status)
const checkPenaltyExists = async (transactionId, userId) => {
  try {
    // Look for any existing unpaid penalty (status != 'Paid') for this transaction/user combination
    const [existing] = await pool.execute(
      `SELECT * FROM penalties 
       WHERE transaction_id = ? AND user_id = ? AND (status != 'Paid' OR status IS NULL)
       ORDER BY updated_at DESC LIMIT 1`,
      [transactionId, userId]
    );
    return existing.length > 0 ? existing[0] : null;
  } catch (error) {
    console.error("Error checking penalty existence:", error);
    return null;
  }
};

// - Returns object describing whether a record was created or updated.
const createOrUpdatePenalty = async (transactionId, userId, fineAmount) => {
  try {
    // First check if there's ANY penalty (paid or unpaid) for this transaction/user
    const [anyExisting] = await pool.execute(
      `SELECT * FROM penalties 
       WHERE transaction_id = ? AND user_id = ? 
       ORDER BY updated_at DESC LIMIT 1`,
      [transactionId, userId]
    );

    if (anyExisting.length > 0) {
      const existingPenalty = anyExisting[0];
      
      // If the penalty is already paid, don't create or update anything
      if (existingPenalty.status === 'Paid') {
        console.log(
          `Penalty for transaction ${transactionId} already paid (penalty_id: ${existingPenalty.penalty_id}), skipping update`
        );
        return {
          created: false,
          updated: false,
          penalty_id: existingPenalty.penalty_id,
          message: "Penalty already paid, no action taken",
          skipped: true
        };
      }
      
      // If penalty is unpaid, update it
      await pool.execute(
        `UPDATE penalties SET fine = ?, updated_at = NOW() WHERE penalty_id = ?`,
        [fineAmount, existingPenalty.penalty_id]
      );
      console.log(
        `Updated penalty ${existingPenalty.penalty_id} for transaction ${transactionId} with fine: ${fineAmount}`
      );
      
      // Clean up any older unpaid penalty records for this transaction/user 
      // (keep only the latest unpaid penalty, preserve all paid penalties)
      await pool.execute(
        `DELETE FROM penalties 
         WHERE transaction_id = ? AND user_id = ? 
           AND penalty_id < ? 
           AND (status != 'Paid' OR status IS NULL)`,
        [transactionId, userId, existingPenalty.penalty_id]
      );
      
      return {
        created: false,
        updated: true,
        penalty_id: existingPenalty.penalty_id,
        message: "Penalty updated",
      };
    }

    // Before creating new penalty, clean up any old "Pending Payment" records
    // (preserve paid penalties with status = 'Paid')
    await pool.execute(
      `DELETE FROM penalties 
       WHERE transaction_id = ? AND user_id = ? AND (status != 'Paid' OR status IS NULL)`,
      [transactionId, userId]
    );

    // Insert new penalty record only if no unpaid penalty exists
    const [result] = await pool.execute(
      `INSERT INTO penalties (transaction_id, user_id, fine, updated_at)
       VALUES (?, ?, ?, NOW())`,
      [transactionId, userId, fineAmount]
    );

    console.log(
      `Created penalty record for transaction ${transactionId}, fine: ${fineAmount}`
    );
    
    return {
      created: true,
      updated: false,
      penalty_id: result.insertId,
      message: "Penalty recorded successfully",
    };
  } catch (error) {
    console.error("Error creating or updating penalty record:", error);
    throw error;
  }
};

// GET ALL PENALTIES WITH TRANSACTION AND USER DETAILS (LATEST ONLY)
router.get("/", async (req, res) => {
  try {
    const { status, user_id, transaction_id } = req.query;

    let whereClause = "WHERE 1=1";
    let params = [];

    if (status) {
      whereClause += " AND p.status = ?";
      params.push(status);
    }

    if (user_id) {
      whereClause += " AND p.user_id = ?";
      params.push(user_id);
    }

    if (transaction_id) {
      whereClause += " AND p.transaction_id = ?";
      params.push(transaction_id);
    }

    // Main query - return latest unpaid penalty per transaction/user + all paid penalties
    const [penalties] = await pool.execute(
      `SELECT 
        p.*,
        t.reference_number,
        t.due_date,
        t.transaction_type,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        u.position,
        d.department_acronym,
        b.book_title,
        rp.research_title,
        DATEDIFF(CURDATE(), STR_TO_DATE(t.due_date, '%Y-%m-%d')) as days_overdue,
        COALESCE(p.status, CASE WHEN p.fine > 0 THEN 'Pending Payment' ELSE 'Paid' END) as status
      FROM penalties p
      LEFT JOIN transactions t ON p.transaction_id = t.transaction_id
      LEFT JOIN users u ON p.user_id = u.user_id
      LEFT JOIN departments d ON u.department_id = d.department_id
      LEFT JOIN books b ON t.book_id = b.book_id
      LEFT JOIN research_papers rp ON t.research_paper_id = rp.research_paper_id
      WHERE (
        -- Get all paid penalties (status = 'Paid')
        p.status = 'Paid'
        OR 
        -- Get only the latest unpaid penalty per transaction/user (status != 'Paid' or NULL)
        ((p.status != 'Paid' OR p.status IS NULL) AND p.penalty_id IN (
          SELECT MAX(p2.penalty_id) 
          FROM penalties p2 
          WHERE (p2.status != 'Paid' OR p2.status IS NULL)
          GROUP BY p2.transaction_id, p2.user_id
        ))
      )
      AND ${whereClause.replace('WHERE 1=1', '1=1')}
      ORDER BY p.updated_at DESC`,
      params
    );

    // Get total count for pagination metadata
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM penalties p
       LEFT JOIN transactions t ON p.transaction_id = t.transaction_id
       LEFT JOIN users u ON p.user_id = u.user_id
       ${whereClause}`,
      params
    );

    const total = countResult[0].total;

    // Format penalties with item titles and status
    const formattedPenalties = penalties.map((penalty) => ({
      ...penalty,
      item_title:
        penalty.book_title || penalty.research_title || "Unknown Item",
      status: penalty.status || (penalty.fine > 0 ? "Pending Payment" : "Paid")
    }));

    res.status(200).json({
      success: true,
      data: {
        penalties: formattedPenalties,
        pagination: {
          total,
          limit: total,
          offset: 0,
          pages: total > 0 ? 1 : 0,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching penalties:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch penalties",
      error: error.message,
    });
  }
});

// GET PENALTIES FOR A SPECIFIC USER
router.get("/user/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      return res
        .status(400)
        .json({ success: false, message: "user_id is required" });
    }

    // Fetch penalties for the user - latest unpaid penalty per transaction + all paid penalties
    const [penalties] = await pool.execute(
      `SELECT 
          p.*,
          t.reference_number,
          t.due_date,
          t.transaction_type,
          CONCAT(u.first_name, ' ', u.last_name) as user_name,
          u.position,
          d.department_acronym,
          b.book_title,
          rp.research_title,
          DATEDIFF(CURDATE(), STR_TO_DATE(t.due_date, '%Y-%m-%d')) as days_overdue,
          COALESCE(p.status, CASE WHEN p.fine > 0 THEN 'Pending Payment' ELSE 'Paid' END) as status
        FROM penalties p
        LEFT JOIN transactions t ON p.transaction_id = t.transaction_id
        LEFT JOIN users u ON p.user_id = u.user_id
        LEFT JOIN departments d ON u.department_id = d.department_id
        LEFT JOIN books b ON t.book_id = b.book_id
        LEFT JOIN research_papers rp ON t.research_paper_id = rp.research_paper_id
        WHERE p.user_id = ? 
          AND (
            -- Get all paid penalties for this user (status = 'Paid')
            p.status = 'Paid'
            OR 
            -- Get only the latest unpaid penalty per transaction for this user (status != 'Paid' or NULL)
            ((p.status != 'Paid' OR p.status IS NULL) AND p.penalty_id IN (
              SELECT MAX(p2.penalty_id) 
              FROM penalties p2 
              WHERE (p2.status != 'Paid' OR p2.status IS NULL) AND p2.user_id = ?
              GROUP BY p2.transaction_id, p2.user_id
            ))
          )
        ORDER BY p.updated_at DESC`,
      [user_id, user_id]
    );

    // Compute simple totals for this user
    const totalCount = penalties.length;
    const totalFines = penalties.reduce((sum, p) => sum + (p.fine || 0), 0);

    const formattedPenalties = penalties.map((p) => ({
      ...p,
      item_title: p.book_title || p.research_title || "Unknown Item",
      status: p.status || (p.fine > 0 ? "Pending Payment" : "Paid")
    }));

    res.status(200).json({
      success: true,
      data: {
        user_id,
        total_count: totalCount,
        total_fines: totalFines,
        penalties: formattedPenalties,
      },
    });
  } catch (error) {
    console.error("Error fetching penalties for user:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch user penalties",
        error: error.message,
      });
  }
});

// GET PENALTY SUMMARY STATISTICS
router.get("/summary", async (req, res) => {
  try {
    // Get total active penalties (latest unpaid penalty per transaction/user)
    const [totalResult] = await pool.execute(
      `SELECT 
         COUNT(*) as total_penalties, 
         SUM(fine) as total_fines
       FROM penalties p1
       WHERE (p1.status != 'Paid' OR p1.status IS NULL)
         AND p1.penalty_id IN (
           SELECT MAX(p2.penalty_id) 
           FROM penalties p2 
           WHERE (p2.status != 'Paid' OR p2.status IS NULL)
           GROUP BY p2.transaction_id, p2.user_id
         )`
    );

    // Get overdue penalties (latest unpaid penalties that are overdue)
    const [overdueResult] = await pool.execute(
      `SELECT 
         COUNT(*) as overdue_count, 
         SUM(p.fine) as overdue_fines
       FROM penalties p
       LEFT JOIN transactions t ON p.transaction_id = t.transaction_id
       WHERE (p.status != 'Paid' OR p.status IS NULL)
         AND STR_TO_DATE(t.due_date, '%Y-%m-%d') < CURDATE()
         AND p.penalty_id IN (
           SELECT MAX(p2.penalty_id) 
           FROM penalties p2 
           WHERE (p2.status != 'Paid' OR p2.status IS NULL)
           GROUP BY p2.transaction_id, p2.user_id
         )`
    );

    // Get recent penalties (last 7 days) - both paid and unpaid
    const [recentResult] = await pool.execute(
      `SELECT COUNT(*) as recent_count, SUM(fine) as recent_fines
       FROM penalties 
       WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );

    res.status(200).json({
      success: true,
      data: {
        total_penalties: totalResult[0].total_penalties || 0,
        total_fines: totalResult[0].total_fines || 0,
        overdue_count: overdueResult[0].overdue_count || 0,
        overdue_fines: overdueResult[0].overdue_fines || 0,
        recent_count: recentResult[0].recent_count || 0,
        recent_fines: recentResult[0].recent_fines || 0,
      },
    });
  } catch (error) {
    console.error("Error fetching penalty summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch penalty summary",
      error: error.message,
    });
  }
});

// MARK PENALTY AS PAID
router.put("/:penalty_id/pay", async (req, res) => {
  try {
    const { penalty_id } = req.params;
    const { payment_method = "manual", notes } = req.body;

    // GET PENALTY DETAILS BEFORE MARKING AS PAID
    const [penaltyDetails] = await pool.execute(
      `SELECT 
        p.*,
        t.reference_number,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        b.book_title,
        rp.research_title
       FROM penalties p
       LEFT JOIN transactions t ON p.transaction_id = t.transaction_id
       LEFT JOIN users u ON p.user_id = u.user_id
       LEFT JOIN books b ON t.book_id = b.book_id
       LEFT JOIN research_papers rp ON t.research_paper_id = rp.research_paper_id
       WHERE p.penalty_id = ?`,
      [penalty_id]
    );

    if (penaltyDetails.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Penalty not found",
      });
    }

    const penalty = penaltyDetails[0];

    // Mark penalty as paid by updating its status (preserve fine amount for audit)
    const [result] = await pool.execute(
      `UPDATE penalties 
       SET status = 'Paid', updated_at = NOW()
       WHERE penalty_id = ?`,
      [penalty_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Penalty not found",
      });
    }

    // BROADCAST WEBSOCKET EVENT FOR PENALTY PAYMENT
    if (wsServer) {
      wsServer.broadcast({
        type: 'PENALTY_PAID',
        data: {
          penalty_id,
          user_id: penalty.user_id,
          user_name: penalty.user_name,
          transaction_id: penalty.transaction_id,
          reference_number: penalty.reference_number,
          fine_amount: penalty.fine,
          payment_method,
          item_title: penalty.book_title || penalty.research_title || 'Unknown Item',
          paid_at: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });

      // SAVE TO ACTIVITY LOG
      try {
        await pool.execute(
          `INSERT INTO activity_logs (user_id, action, details, status, created_at)
           VALUES (?, ?, ?, ?, NOW())`,
          [
            penalty.user_id,
            'PENALTY_PAID',
            `Paid penalty of ₱${penalty.fine} for Reference: ${penalty.reference_number} - Payment Method: ${payment_method}${notes ? ' - Notes: ' + notes : ''}`,
            'completed'
          ]
        );
      } catch (logError) {
        console.error('Error saving activity log:', logError);
        // Don't fail the request if logging fails
      }
    }

    res.status(200).json({
      success: true,
      message: "Penalty marked as paid",
      data: {
        penalty_id,
        user_id: penalty.user_id,
        user_name: penalty.user_name,
        fine_amount: penalty.fine,
        payment_method,
        paid_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error marking penalty as paid:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark penalty as paid",
      error: error.message,
    });
  }
});

// PROCESS OVERDUE TRANSACTIONS AND CREATE PENALTIES
router.post("/process-overdue", async (req, res) => {
  try {
    const systemSettings = await getSystemSettings();
    let processed = 0;
    let created = 0;
    let skipped = 0;
    const errors = [];

    // Get all overdue transactions
    const [overdueTransactions] = await pool.execute(
      `SELECT 
        t.*,
        u.position,
        DATEDIFF(CURDATE(), STR_TO_DATE(t.due_date, '%Y-%m-%d')) as days_overdue
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.user_id
      WHERE t.transaction_type = 'borrow' 
        AND t.due_date IS NOT NULL 
        AND STR_TO_DATE(t.due_date, '%Y-%m-%d') < CURDATE()
      ORDER BY t.due_date ASC`
    );

    let updatedCount = 0;
    for (const transaction of overdueTransactions) {
      try {
        processed++;

        // Calculate daily fine based on user type
        const isStudent =
          !transaction.position || transaction.position === "Student";
        const dailyFine = isStudent
          ? systemSettings.student_daily_fine
          : systemSettings.faculty_daily_fine;

        // Calculate total fine (days overdue * daily fine)
        const totalFine = transaction.days_overdue * dailyFine;

        // Try to create penalty record
        const result = await createOrUpdatePenalty(
          transaction.transaction_id,
          transaction.user_id,
          totalFine
        );

        if (result.created) {
          created++;
        } else if (result.updated) {
          updatedCount++;
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(
          `Error processing transaction ${transaction.transaction_id}:`,
          error
        );
        errors.push({
          transaction_id: transaction.transaction_id,
          error: error.message,
        });
      }
    }

    res.status(200).json({
      success: true,
      message: "Overdue transactions processed",
      data: {
        total_processed: processed,
        penalties_created: created,
        penalties_updated: updatedCount,
        penalties_skipped: skipped,
        errors: errors.length,
        error_details: errors,
      },
    });
  } catch (error) {
    console.error("Error processing overdue transactions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process overdue transactions",
      error: error.message,
    });
  }
});

// RECALCULATE FINES AND UPDATE EXISTING PENALTIES (uses current system settings)
// This endpoint will walk overdue transactions and update the penalties table using the
// latest fine structure. It updates existing penalty rows if present (no duplicate rows),
// or inserts a penalty if none exists for that transaction/user.
router.post("/recalculate", async (req, res) => {
  try {
    const systemSettings = await getSystemSettings();
    let processed = 0;
    let updated = 0;
    let created = 0;
    const errors = [];

    // Get all overdue borrow transactions
    const [overdueTransactions] = await pool.execute(
      `SELECT 
        t.*,
        u.position
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.user_id
      WHERE t.transaction_type = 'borrow'
        AND t.due_date IS NOT NULL
        AND STR_TO_DATE(t.due_date, '%Y-%m-%d') < CURDATE()
      ORDER BY t.due_date ASC`
    );

    for (const transaction of overdueTransactions) {
      try {
        processed++;

        const isStudent =
          !transaction.position || transaction.position === "Student";
        const dailyFine = isStudent
          ? systemSettings.student_daily_fine
          : systemSettings.faculty_daily_fine;

        // Calculate days overdue using SQL-like approach (server date)
        const [daysRow] = await pool.execute(
          `SELECT DATEDIFF(CURDATE(), STR_TO_DATE(?, '%Y-%m-%d')) as days_overdue`,
          [transaction.due_date]
        );
        const days_overdue = (daysRow[0] && daysRow[0].days_overdue) || 0;
        const totalFine = Math.max(0, days_overdue) * dailyFine;

        // Find latest penalty for this transaction/user (any date)
        const [existingRows] = await pool.execute(
          `SELECT * FROM penalties WHERE transaction_id = ? AND user_id = ? ORDER BY updated_at DESC LIMIT 1`,
          [transaction.transaction_id, transaction.user_id]
        );

        if (existingRows.length > 0) {
          // Update existing penalty record
          await pool.execute(
            `UPDATE penalties SET fine = ?, updated_at = NOW() WHERE penalty_id = ?`,
            [totalFine, existingRows[0].penalty_id]
          );
          updated++;
        } else {
          // Insert new penalty record
          await pool.execute(
            `INSERT INTO penalties (transaction_id, user_id, fine, updated_at) VALUES (?, ?, ?, NOW())`,
            [transaction.transaction_id, transaction.user_id, totalFine]
          );
          created++;
        }
      } catch (error) {
        console.error(
          `Error recalculating penalty for transaction ${transaction.transaction_id}:`,
          error
        );
        errors.push({
          transaction_id: transaction.transaction_id,
          error: error.message,
        });
      }
    }

    res.status(200).json({
      success: true,
      message: "Recalculation finished",
      data: {
        total_processed: processed,
        penalties_updated: updated,
        penalties_created: created,
        errors: errors.length,
        error_details: errors,
      },
    });
  } catch (error) {
    console.error("Error during recalculation:", error);
    res.status(500).json({
      success: false,
      message: "Failed to recalculate penalties",
      error: error.message,
    });
  }
});

// CLEANUP OLD PENALTY RECORDS - Keep only the latest unpaid penalty per transaction/user, preserve all paid penalties
router.post("/cleanup", async (req, res) => {
  try {
    const [result] = await pool.execute(
      `DELETE p1 FROM penalties p1
       INNER JOIN penalties p2 
       WHERE p1.transaction_id = p2.transaction_id 
         AND p1.user_id = p2.user_id
         AND p1.penalty_id < p2.penalty_id
         AND (p1.status != 'Paid' OR p1.status IS NULL)
         AND (p2.status != 'Paid' OR p2.status IS NULL)`
    );

    res.status(200).json({
      success: true,
      message: "Penalty cleanup completed (preserved all paid penalties)",
      data: {
        records_deleted: result.affectedRows
      }
    });

  } catch (error) {
    console.error("Error during penalty cleanup:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cleanup penalties",
      error: error.message
    });
  }
});

// DELETE PENALTY (ADMIN ONLY)
router.delete("/:penalty_id", async (req, res) => {
  try {
    const { penalty_id } = req.params;

    const [result] = await pool.execute(
      `DELETE FROM penalties WHERE penalty_id = ?`,
      [penalty_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Penalty not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Penalty deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting penalty:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete penalty",
      error: error.message,
    });
  }
});

// Export the penalty creation function for use by other modules
module.exports = router;
module.exports.createOrUpdatePenalty = createOrUpdatePenalty;
module.exports.checkPenaltyExists = checkPenaltyExists;
