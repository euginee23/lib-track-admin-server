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
    // Convert limit and offset to integers and clamp to safe ranges
    let parsedLimit = Number.parseInt(limit, 10);
    let parsedOffset = Number.parseInt(offset, 10);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) parsedLimit = 50;
    if (!Number.isFinite(parsedOffset) || parsedOffset < 0) parsedOffset = 0;
    // enforce a reasonable max page size
    const MAX_LIMIT = 1000;
    if (parsedLimit > MAX_LIMIT) parsedLimit = MAX_LIMIT;

    // Build SQL without parameter placeholders for LIMIT/OFFSET (some MySQL drivers have issues binding them)
    const logsSql = `SELECT 
        al.*,
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), CONCAT(a.first_name, ' ', a.last_name)) as user_name,
        COALESCE(u.position, a.role) as position,
        COALESCE(u.email, a.email) as email,
        d.department_name,
        d.department_acronym,
        CASE
          WHEN u.user_id IS NOT NULL THEN 'user'
          WHEN a.admin_id IS NOT NULL THEN 'admin'
          ELSE 'unknown'
        END as actor_type
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.user_id
       LEFT JOIN administrators a ON al.user_id = a.admin_id
       LEFT JOIN departments d ON u.department_id = d.department_id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT ${parsedLimit} OFFSET ${parsedOffset}`;

    const [logs] = await pool.execute(logsSql, params);

    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          limit: parsedLimit,
          offset: parsedOffset,
          pages: Math.ceil(total / parsedLimit)
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

    // Convert limit and offset to integers and clamp
    let parsedLimit = Number.parseInt(limit, 10);
    let parsedOffset = Number.parseInt(offset, 10);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) parsedLimit = 50;
    if (!Number.isFinite(parsedOffset) || parsedOffset < 0) parsedOffset = 0;
    const MAX_LIMIT = 1000;
    if (parsedLimit > MAX_LIMIT) parsedLimit = MAX_LIMIT;

    // Get activity logs for the user (inject sanitized LIMIT/OFFSET)
    const userLogsSql = `SELECT 
        al.*,
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), CONCAT(a.first_name, ' ', a.last_name)) as user_name,
        COALESCE(u.position, a.role) as position,
        COALESCE(u.email, a.email) as email,
        d.department_name,
        d.department_acronym,
        CASE
          WHEN u.user_id IS NOT NULL THEN 'user'
          WHEN a.admin_id IS NOT NULL THEN 'admin'
          ELSE 'unknown'
        END as actor_type
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.user_id
       LEFT JOIN administrators a ON al.user_id = a.admin_id
       LEFT JOIN departments d ON u.department_id = d.department_id
       WHERE al.user_id = ?
       ORDER BY al.created_at DESC
       LIMIT ${parsedLimit} OFFSET ${parsedOffset}`;

    const [logs] = await pool.execute(userLogsSql, [user_id]);

    res.status(200).json({
      success: true,
      data: {
        user_id,
        total_activities: total,
        logs,
        pagination: {
          total,
          limit: parsedLimit,
          offset: parsedOffset,
          pages: Math.ceil(total / parsedLimit)
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
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), CONCAT(a.first_name, ' ', a.last_name)) as user_name,
        COALESCE(u.position, a.role) as position,
        COALESCE(u.email, a.email) as email,
        d.department_name,
        d.department_acronym,
        CASE
          WHEN u.user_id IS NOT NULL THEN 'user'
          WHEN a.admin_id IS NOT NULL THEN 'admin'
          ELSE 'unknown'
        END as actor_type
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.user_id
       LEFT JOIN administrators a ON al.user_id = a.admin_id
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

// MARK SINGLE ACTIVITY LOG AS READ/UNREAD
router.post('/:activity_log_id/read', async (req, res) => {
  try {
    const { activity_log_id } = req.params;
    const { admin_id, read = true } = req.body;

    if (read) {
      if (!admin_id) {
        return res.status(400).json({ success: false, message: 'admin_id is required when marking as read' });
      }

      const [result] = await pool.execute(
        `UPDATE activity_logs SET is_read = 1, read_at = NOW(), read_by_admin_id = ? WHERE activity_log_id = ?`,
        [admin_id, activity_log_id]
      );

      return res.status(200).json({ success: true, message: 'Marked as read', affectedRows: result.affectedRows });
    } else {
      const [result] = await pool.execute(
        `UPDATE activity_logs SET is_read = 0, read_at = NULL, read_by_admin_id = NULL WHERE activity_log_id = ?`,
        [activity_log_id]
      );

      return res.status(200).json({ success: true, message: 'Marked as unread', affectedRows: result.affectedRows });
    }
  } catch (error) {
    console.error('Error marking activity log read/unread:', error);
    res.status(500).json({ success: false, message: 'Failed to update read status', error: error.message });
  }
});

// MARK MULTIPLE ACTIVITY LOGS AS READ/UNREAD (BATCH)
router.post('/read', async (req, res) => {
  try {
    const { ids, admin_id, read = true } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'ids (array) is required' });
    }

    // sanitize and ensure numeric ids
    const sanitizedIds = ids.map(i => Number.parseInt(i, 10)).filter(Number.isFinite);
    if (sanitizedIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid ids provided' });
    }

    const placeholders = sanitizedIds.map(() => '?').join(',');

    if (read) {
      if (!admin_id) {
        return res.status(400).json({ success: false, message: 'admin_id is required when marking as read' });
      }

      const sql = `UPDATE activity_logs SET is_read = 1, read_at = NOW(), read_by_admin_id = ? WHERE activity_log_id IN (${placeholders})`;
      const params = [admin_id, ...sanitizedIds];
      const [result] = await pool.execute(sql, params);

      return res.status(200).json({ success: true, message: 'Marked batch as read', affectedRows: result.affectedRows });
    } else {
      const sql = `UPDATE activity_logs SET is_read = 0, read_at = NULL, read_by_admin_id = NULL WHERE activity_log_id IN (${placeholders})`;
      const params = sanitizedIds;
      const [result] = await pool.execute(sql, params);

      return res.status(200).json({ success: true, message: 'Marked batch as unread', affectedRows: result.affectedRows });
    }
  } catch (error) {
    console.error('Error marking batch read/unread:', error);
    res.status(500).json({ success: false, message: 'Failed to update read status for batch', error: error.message });
  }
});

// GET UNREAD COUNT
router.get('/unread/count', async (req, res) => {
  try {
    const [rows] = await pool.execute(`SELECT COUNT(*) as unread_count FROM activity_logs WHERE is_read = 0`);
    return res.status(200).json({ success: true, data: { unread_count: rows[0].unread_count } });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch unread count', error: error.message });
  }
});

// MARK ALL UNREAD ACTIVITY LOGS AS READ (ADMIN ONLY)
router.post('/read/all', async (req, res) => {
  try {
    const { admin_id } = req.body;

    if (!admin_id) {
      return res.status(400).json({ success: false, message: 'admin_id is required' });
    }

    const [result] = await pool.execute(
      `UPDATE activity_logs SET is_read = 1, read_at = NOW(), read_by_admin_id = ? WHERE is_read = 0`,
      [admin_id]
    );

    return res.status(200).json({ success: true, message: 'Marked all unread logs as read', affectedRows: result.affectedRows });
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ success: false, message: 'Failed to mark all as read', error: error.message });
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
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), CONCAT(a.first_name, ' ', a.last_name)) as user_name,
        COALESCE(u.position, a.role) as position,
        COUNT(*) as activity_count
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.user_id
       LEFT JOIN administrators a ON al.user_id = a.admin_id
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
