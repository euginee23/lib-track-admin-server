const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { logAdminAuth } = require("../helpers/activityLogger");

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

    // LOG ADMIN LOGIN
    await logAdminAuth({
      admin_id: admin.admin_id,
      action: 'ADMIN_LOGIN',
      admin_name: `${admin.first_name} ${admin.last_name}`,
      email: admin.email,
      ip_address: req.ip || req.connection.remoteAddress
    });

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

// UPDATE OWN ACCOUNT ROUTE
router.put("/account", async (req, res) => {
  const { adminId, firstName, lastName, email, currentPassword, newPassword } = req.body;

  // VALIDATE REQUIRED FIELDS
  if (!adminId || !firstName || !lastName || !email || !currentPassword) {
    return res.status(400).json({ message: "Admin ID, first name, last name, email, and current password are required." });
  }

  try {
    // VERIFY ADMIN EXISTS
    const [adminRows] = await pool.query(
      `SELECT * FROM administrators WHERE admin_id = ? LIMIT 1`,
      [adminId]
    );

    if (adminRows.length === 0) {
      return res.status(404).json({ message: "Administrator not found." });
    }

    const admin = adminRows[0];

    // VERIFY CURRENT PASSWORD
    const passwordMatch = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Current password is incorrect." });
    }

    // CHECK IF EMAIL IS ALREADY TAKEN BY ANOTHER ADMIN
    if (email !== admin.email) {
      const [emailCheck] = await pool.query(
        `SELECT admin_id FROM administrators WHERE email = ? AND admin_id != ? LIMIT 1`,
        [email, adminId]
      );

      if (emailCheck.length > 0) {
        return res.status(409).json({ message: "Email is already in use by another administrator." });
      }
    }

    // PREPARE UPDATE QUERY
    let updateQuery = `UPDATE administrators SET first_name = ?, last_name = ?, email = ?`;
    let queryParams = [firstName, lastName, email];

    // IF NEW PASSWORD PROVIDED, HASH AND INCLUDE IN UPDATE
    if (newPassword && newPassword.trim()) {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      updateQuery += `, password_hash = ?`;
      queryParams.push(hashedPassword);
    }

    updateQuery += ` WHERE admin_id = ?`;
    queryParams.push(adminId);

    // EXECUTE UPDATE
    await pool.query(updateQuery, queryParams);

    // FETCH UPDATED ADMIN DATA
    const [updatedAdmin] = await pool.query(
      `SELECT * FROM administrators WHERE admin_id = ? LIMIT 1`,
      [adminId]
    );

    const adminData = updatedAdmin[0];

    // RETURN UPDATED ADMIN DATA
    res.status(200).json({
      success: true,
      message: "Account updated successfully.",
      user: {
        id: adminData.admin_id,
        firstName: adminData.first_name,
        lastName: adminData.last_name,
        email: adminData.email,
        role: adminData.role,
        status: adminData.status,
        permissions: {
          dashboard: !!adminData.perm_dashboard,
          manageBooks: !!adminData.perm_manage_books,
          bookReservations: !!adminData.perm_book_reservations,
          manageRegistrations: !!adminData.perm_manage_registrations,
          bookTransactions: !!adminData.perm_book_transactions,
          managePenalties: !!adminData.perm_manage_penalties,
          activityLogs: !!adminData.perm_activity_logs,
          settings: !!adminData.perm_settings,
          manageAdministrators: !!adminData.perm_manage_administrators
        }
      }
    });
  } catch (error) {
    console.error("Error updating account:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

// ADMIN LOGOUT ROUTE
router.post("/logout", async (req, res) => {
  const { adminId, firstName, lastName, email } = req.body;

  // VALIDATE REQUIRED FIELDS
  if (!adminId || !email) {
    return res.status(400).json({ message: "Admin ID and email are required." });
  }

  try {
    // LOG ADMIN LOGOUT
    await logAdminAuth({
      admin_id: adminId,
      action: 'ADMIN_LOGOUT',
      admin_name: `${firstName || ''} ${lastName || ''}`.trim() || 'Admin',
      email: email,
      ip_address: req.ip || req.connection.remoteAddress
    });

    res.status(200).json({
      success: true,
      message: "Logout successful."
    });
  } catch (error) {
    console.error("Error during admin logout:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

module.exports = router;
