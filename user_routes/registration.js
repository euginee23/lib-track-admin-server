const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const { pool } = require("../config/database");
const bcrypt = require("bcryptjs");

// USER REGISTRATION ROUTE
router.post("/register", upload.single("corImage"), async (req, res) => {
  const {
    firstName,
    middleName,
    lastName,
    email,
    studentId,
    contactNumber,
    password
  } = req.body;

  // VALIDATE REQUIRED FIELDS
  if (!firstName || !lastName || !email || !studentId || !password) {
    return res.status(400).json({ message: "All required fields must be filled." });
  }

  try {
  // CHECK IF USER ALREADY EXISTS
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE email = ? OR student_id = ? OR contact_number = ?",
      [email, studentId, contactNumber]
    );

    if (rows.length > 0) {
      const existingUser = rows[0];
      const conflictFields = [];
      if (existingUser.email === email) conflictFields.push("email");
      if (existingUser.student_id === studentId) conflictFields.push("student_id");
      if (existingUser.contact_number === contactNumber) conflictFields.push("contact_number");

      return res.status(409).json({
        message: `User already exists with the following fields: ${conflictFields.join(", ")}`,
        conflictFields,
      });
    }

  // INSERT USER DATA INTO THE DATABASE
    const corImage = req.file ? req.file.buffer : null;
    const createdAt = new Date();

  // HASH THE PASSWORD USING BCRYPT
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    await pool.query(
      `INSERT INTO users (first_name, middle_name, last_name, student_id, contact_number, cor, email, password, librarian_approval, email_verification, profile_photo, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        firstName,
        middleName,
        lastName,
        studentId,
        contactNumber || null,
        corImage,
        email,
        hashedPassword,
        0, 
        0,
        null,
        createdAt
      ]
    );

    res.status(201).json({ message: "User registered successfully." });
  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

module.exports = router;