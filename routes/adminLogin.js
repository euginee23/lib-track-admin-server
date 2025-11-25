const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ADMIN LOGIN ROUTE
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // VALIDATE REQUIRED FIELDS
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    // CHECK IF ADMIN EXISTS WITH THE PROVIDED EMAIL
    const [rows] = await pool.query(
      `SELECT * FROM administrators WHERE email = ? LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Administrator not found." });
    }

    const admin = rows[0];

    // CHECK IF ADMIN IS ACTIVE
    if (admin.status !== 'Active') {
      return res.status(403).json({ message: "Your account is inactive. Please contact a Super Admin." });
    }

    // VERIFY PASSWORD USING BCRYPT
    const passwordMatch = await bcrypt.compare(password, admin.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    // UPDATE LAST LOGIN TIME
    await pool.query(
      `UPDATE administrators SET last_login = NOW() WHERE admin_id = ?`,
      [admin.admin_id]
    );

    // GENERATE JWT TOKEN
    const tokenPayload = {
      adminId: admin.admin_id,
      email: admin.email,
      firstName: admin.first_name,
      lastName: admin.last_name,
      role: admin.role
    };
    
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET || "your-secret-key", {
      expiresIn: "24h"
    });

    // PREPARE ADMIN DATA
    const adminData = {
      id: admin.admin_id,
      firstName: admin.first_name,
      lastName: admin.last_name,
      email: admin.email,
      role: admin.role,
      status: admin.status,
      permissions: {
        dashboard: !!admin.perm_dashboard,
        manageBooks: !!admin.perm_manage_books,
        bookReservations: !!admin.perm_book_reservations,
        manageRegistrations: !!admin.perm_manage_registrations,
        bookTransactions: !!admin.perm_book_transactions,
        managePenalties: !!admin.perm_manage_penalties,
        activityLogs: !!admin.perm_activity_logs,
        settings: !!admin.perm_settings,
        manageAdministrators: !!admin.perm_manage_administrators
      }
    };

    // SUCCESSFUL LOGIN
    res.status(200).json({
      success: true,
      message: "Login successful.",
      user: adminData,
      token: token
    });
  } catch (error) {
    console.error("Error during admin login:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

module.exports = router;
