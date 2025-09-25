const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");
const bcrypt = require("bcryptjs");

// USER LOGIN ROUTE
router.post("/login", async (req, res) => {
  const { identifier, password } = req.body;

  // VALIDATE REQUIRED FIELDS
  if (!identifier || !password) {
    return res.status(400).json({ message: "Identifier and password are required." });
  }

  try {
  // CHECK IF USER EXISTS WITH THE PROVIDED IDENTIFIER (EMAIL, STUDENT ID, OR PHONE NUMBER)
    const [rows] = await pool.query(
      `SELECT * FROM users WHERE email = ? OR student_id = ? OR contact_number = ?`,
      [identifier, identifier, identifier]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found. Please register first." });
    }

    const user = rows[0];

  // VERIFY PASSWORD USING BCRYPT
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

  // CHECK IF THE USER IS APPROVED BY THE LIBRARIAN AND EMAIL IS VERIFIED
    if (user.librarian_approval === 0 && user.email_verification === 0) {
        return res.status(403).json({ message: "Your account is pending librarian approval and email verification.", user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          studentId: user.student_id,
          contactNumber: user.contact_number,
        }});
    }

    if (user.librarian_approval === 0) {
        return res.status(403).json({ message: "Your account is pending librarian approval.", user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          studentId: user.student_id,
          contactNumber: user.contact_number,
        }});
    }

    if (user.email_verification === 0) {
        return res.status(403).json({ message: "Please verify your email address.", user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          studentId: user.student_id,
          contactNumber: user.contact_number,
        }});
    }

  // SUCCESSFUL LOGIN
    res.status(200).json({
      message: "Login successful.",
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        studentId: user.student_id,
        contactNumber: user.contact_number,
      },
    });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

module.exports = router;