const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");

// GET ALL REGISTERED USERS WITH DEPARTMENT DETAILS
router.get("/registrations", async (req, res) => {
  try {
    const { page = 1, limit = 100, search = '', filter = '', filterStatus = '' } = req.query;
    const offset = (page - 1) * limit;

    // Build dynamic WHERE clauses based on filters
    const whereClauses = [];
    const params = [];

    if (search && search.toString().trim() !== '') {
      const s = `%${search}%`;
      whereClauses.push(`(CONCAT(users.first_name, ' ', users.last_name) LIKE ? OR users.email LIKE ? OR users.student_id LIKE ? OR users.contact_number LIKE ? OR departments.department_name LIKE ?)`);
      params.push(s, s, s, s, s);
    }

    if (filter === 'status' && filterStatus) {
      if (filterStatus === 'pending') {
        whereClauses.push('users.librarian_approval = 0');
      } else if (filterStatus === 'approved') {
        whereClauses.push('users.librarian_approval = 1');
      }
    }

    if (filter === 'position' && filterStatus) {
      whereClauses.push('users.position = ?');
      params.push(filterStatus);
    }

    if (filter === 'department' && filterStatus) {
      whereClauses.push('departments.department_name = ?');
      params.push(filterStatus);
    }

    // Always include departments join conditions; build base query
    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Get total count for pagination (apply same filters)
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM users LEFT JOIN departments ON users.department_id = departments.department_id ${whereSQL}`,
      params
    );
    const totalCount = countResult[0].total || 0;

    // Get paginated results (include restriction flag)
    const dataParams = params.concat([parseInt(limit), parseInt(offset)]);
    const [rows] = await pool.query(
      `SELECT users.*, users.restriction, departments.department_name, departments.department_acronym 
       FROM users 
       LEFT JOIN departments ON users.department_id = departments.department_id
       ${whereSQL}
       ORDER BY users.created_at DESC
       LIMIT ? OFFSET ?`,
       dataParams
    );

    res.status(200).json({
      users: rows,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.max(1, Math.ceil(totalCount / limit))
      }
    });
  } catch (error) {
    console.error("Error fetching users with department details:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

// GET DISTINCT POSITIONS WITH COUNTS
router.get("/registrations/positions", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
        IFNULL(position, 'Unknown') as position, 
        COUNT(*) as count 
       FROM users 
       GROUP BY position 
       ORDER BY count DESC`
    );
    
    res.status(200).json({ positions: rows });
  } catch (error) {
    console.error("Error fetching positions:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

// GET USER BY ID
router.get("/registrations/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT users.*, users.restriction, departments.department_name, departments.department_acronym 
       FROM users 
       LEFT JOIN departments ON users.department_id = departments.department_id
       WHERE users.user_id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({ user: rows[0] });
  } catch (error) {
    console.error("Error fetching user by ID:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

module.exports = router;