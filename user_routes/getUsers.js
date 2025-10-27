const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");

// GET ALL REGISTERED USERS WITH DEPARTMENT DETAILS
router.get("/registrations", async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    const offset = (page - 1) * limit;
    
    // Get total count for pagination
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM users`
    );
    const totalCount = countResult[0].total;
    
    // Get paginated results (include restriction flag)
    const [rows] = await pool.query(
      `SELECT users.*, users.restriction, departments.department_name, departments.department_acronym 
       FROM users 
       LEFT JOIN departments ON users.department_id = departments.department_id
       ORDER BY users.created_at DESC
       LIMIT ? OFFSET ?`,
       [parseInt(limit), parseInt(offset)]
    );
    
    res.status(200).json({
      users: rows,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching users with department details:", error);
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