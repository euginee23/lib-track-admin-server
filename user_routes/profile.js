const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");
const jwt = require("jsonwebtoken");

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required." });
  }

  jwt.verify(token, process.env.JWT_SECRET || "your-secret-key", (err, user) => {
    if (err) {
      return res.status(401).json({ message: "Invalid or expired token." });
    }
    req.user = user;
    next();
  });
};

// GET USER PROFILE ROUTE
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get fresh user data from database
    const [rows] = await pool.query(
      `SELECT * FROM users WHERE user_id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = rows[0];

    // Prepare user data (same format as login)
    const userData = {
      id: user.user_id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      studentId: user.student_id,
      contactNumber: user.contact_number,
      email_verification: user.email_verification,
      librarian_approval: user.librarian_approval
    };

    res.status(200).json({
      message: "Profile retrieved successfully.",
      user: userData
    });

  } catch (error) {
    console.error("Error retrieving profile:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

module.exports = router;