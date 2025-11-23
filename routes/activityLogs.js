const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");

// Helper function to safely handle null values
function safe(val) {
  return val === undefined ? null : val;
}

// CREATE ACTIVITY LOG
router.post("/", async (req, res) => {
  try {
    const { user_id, action, details, status } = req.body;

    // Validate required fields
    if (!user_id || !action) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
        error: "user_id and action are required"
      });
    }

    // Insert activity log
    const [result] = await pool.execute(
      `INSERT INTO activity_logs (user_id, action, details, status, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [user_id, action, safe(details), safe(status) || 'completed']
    );

    res.status(201).json({
      success: true,
      message: "Activity log created successfully",
      data: {
        activity_log_id: result.insertId,
        user_id,
        action,
        details: safe(details),
        status: safe(status) || 'completed',
        created_at: new Date()
      }
    });

  } catch (error) {
    console.error("Error creating activity log:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create activity log",
      error: error.message
    });
  }
});

// GET ALL ACTIVITY LOGS WITH PAGINATION AND FILTERING
router.get("/", async (req, res) => {
  try {
    const { 
      user_id, 
      action, 
      status, 
      limit = 50, 
      offset = 0,
      start_date,
      end_date 
    } = req.query;

    let whereClause = "WHERE 1=1";
    let params = [];

    if (user_id) {
      whereClause += " AND al.user_id = ?";
      params.push(user_id);
    }

    if (action) {
      whereClause += " AND al.action LIKE ?";
      params.push(`%${action}%`);
    }

    if (status) {
      whereClause += " AND al.status = ?";
      params.push(status);
    }

    if (start_date) {
      whereClause += " AND al.created_at >= ?";
      params.push(start_date);
    }

    if (end_date) {
      whereClause += " AND al.created_at <= ?";
      params.push(end_date);
    }

    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total 
       FROM activity_logs al
       ${whereClause}`,
      params
    );

    const total = countResult[0].total;

    // Get activity logs with user details
    const [logs] = await pool.execute(
      `SELECT 
        al.*,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        u.position,
        u.email,
        d.department_name,
        d.department_acronym
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.user_id
       LEFT JOIN departments d ON u.department_id = d.department_id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error("Error fetching activity logs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch activity logs",
      error: error.message
    });
  }
});

// GET ACTIVITY LOGS FOR A SPECIFIC USER
router.get("/user/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required"
      });
    }

    // Get total count for this user
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total 
       FROM activity_logs 
       WHERE user_id = ?`,
      [user_id]
    );

    const total = countResult[0].total;

    // Get activity logs for the user
    const [logs] = await pool.execute(
      `SELECT 
        al.*,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        u.position,
        u.email,
        d.department_name,
        d.department_acronym
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.user_id
       LEFT JOIN departments d ON u.department_id = d.department_id
       WHERE al.user_id = ?
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [user_id, parseInt(limit), parseInt(offset)]
    );

    res.status(200).json({
      success: true,
      data: {
        user_id,
        total_activities: total,
        logs,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error("Error fetching user activity logs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user activity logs",
      error: error.message
    });
  }
});

// GET ACTIVITY LOG BY ID
router.get("/:activity_log_id", async (req, res) => {
  try {
    const { activity_log_id } = req.params;

    const [logs] = await pool.execute(
      `SELECT 
        al.*,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        u.position,
        u.email,
        d.department_name,
        d.department_acronym
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.user_id
       LEFT JOIN departments d ON u.department_id = d.department_id
       WHERE al.activity_log_id = ?`,
      [activity_log_id]
    );

    if (logs.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Activity log not found"
      });
    }

    res.status(200).json({
      success: true,
      data: logs[0]
    });

  } catch (error) {
    console.error("Error fetching activity log:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch activity log",
      error: error.message
    });
  }
});

// GET ACTIVITY STATISTICS
router.get("/stats/summary", async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let dateFilter = "";
    let params = [];

    if (start_date && end_date) {
      dateFilter = "WHERE created_at BETWEEN ? AND ?";
      params = [start_date, end_date];
    } else if (start_date) {
      dateFilter = "WHERE created_at >= ?";
      params = [start_date];
    } else if (end_date) {
      dateFilter = "WHERE created_at <= ?";
      params = [end_date];
    }

    // Get total activities
    const [totalResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM activity_logs ${dateFilter}`,
      params
    );

    // Get activities by action type
    const [actionStats] = await pool.execute(
      `SELECT action, COUNT(*) as count 
       FROM activity_logs 
       ${dateFilter}
       GROUP BY action 
       ORDER BY count DESC`,
      params
    );

    // Get activities by status
    const [statusStats] = await pool.execute(
      `SELECT status, COUNT(*) as count 
       FROM activity_logs 
       ${dateFilter}
       GROUP BY status`,
      params
    );

    // Get most active users
    const [userStats] = await pool.execute(
      `SELECT 
        al.user_id,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        u.position,
        COUNT(*) as activity_count
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.user_id
       ${dateFilter}
       GROUP BY al.user_id
       ORDER BY activity_count DESC
       LIMIT 10`,
      params
    );

    res.status(200).json({
      success: true,
      data: {
        total_activities: totalResult[0].total,
        by_action: actionStats,
        by_status: statusStats,
        most_active_users: userStats,
        date_range: {
          start: start_date || null,
          end: end_date || null
        }
      }
    });

  } catch (error) {
    console.error("Error fetching activity statistics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch activity statistics",
      error: error.message
    });
  }
});

// DELETE ACTIVITY LOG (ADMIN ONLY)
router.delete("/:activity_log_id", async (req, res) => {
  try {
    const { activity_log_id } = req.params;

    const [result] = await pool.execute(
      "DELETE FROM activity_logs WHERE activity_log_id = ?",
      [activity_log_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Activity log not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Activity log deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting activity log:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete activity log",
      error: error.message
    });
  }
});

module.exports = router;
