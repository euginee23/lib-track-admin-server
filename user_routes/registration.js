const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});
const { pool } = require("../config/database");
const bcrypt = require("bcryptjs");

// USER REGISTRATION ROUTE
router.post("/register", upload.fields([
  { name: "corImage", maxCount: 1 },
  { name: "profileImage", maxCount: 1 }
]), async (req, res) => {
  const {
    firstName,
    middleName,
    lastName,
    email,
    studentId,
    facultyId,
    contactNumber,
    college,
    position,
    yearLevel,
    password
  } = req.body;

  // VALIDATE REQUIRED FIELDS
  if (!firstName || !lastName || !email || !password || !college) {
    return res.status(400).json({ message: "All required fields must be filled." });
  }

  // VALIDATE POSITION SPECIFIC FIELDS
  if (position === "Student" && !studentId) {
    return res.status(400).json({ message: "Student ID is required for student registration." });
  }

  if (position !== "Student" && !facultyId) {
    return res.status(400).json({ message: "Faculty ID is required for faculty registration." });
  }

  if (!position) {
    return res.status(400).json({ message: "Position is required." });
  }

  try {
    // CHECK IF USER ALREADY EXISTS
    let checkQuery = "SELECT * FROM users WHERE email = ?";
    let checkParams = [email];

    if (position === "Student" && studentId) {
      checkQuery += " OR student_id = ?";
      checkParams.push(studentId);
    }

    if (position !== "Student" && facultyId) {
      checkQuery += " OR faculty_id = ?";
      checkParams.push(facultyId);
    }

    if (contactNumber) {
      checkQuery += " OR contact_number = ?";
      checkParams.push(contactNumber);
    }

    const [rows] = await pool.query(checkQuery, checkParams);

    if (rows.length > 0) {
      const existingUser = rows[0];
      const conflictFields = [];
      if (existingUser.email === email) conflictFields.push("email");
      if (existingUser.student_id === studentId) conflictFields.push("student_id");
      if (existingUser.faculty_id === facultyId) conflictFields.push("faculty_id");
      if (existingUser.contact_number === contactNumber) conflictFields.push("contact_number");

      return res.status(409).json({
        message: `User already exists with the following fields: ${conflictFields.join(", ")}`,
        conflictFields,
      });
    }

    // STORE SELECTED DEPARTMENT ID
    const departmentId = college;

    // INSERT USER DATA INTO THE DATABASE
    const corImage = req.files?.corImage ? req.files.corImage[0].buffer : null;
    const profileImage = req.files?.profileImage ? req.files.profileImage[0].buffer : null;
    const createdAt = new Date();

    // HASH THE PASSWORD USING BCRYPT
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    await pool.query(
      `INSERT INTO users (first_name, middle_name, last_name, student_id, faculty_id, department_id, position, year_level, contact_number, cor, email, password, librarian_approval, email_verification, profile_photo, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        firstName,
        middleName || null,
        lastName,
        position === "Student" ? studentId : null,
        position !== "Student" ? facultyId : null,
        departmentId,
        position,
        position === "Student" ? yearLevel : null,
        contactNumber || null,
        corImage,
        email,
        hashedPassword,
        0, 
        0,
        profileImage,
        createdAt
      ]
    );

    res.status(201).json({ message: "User registered successfully." });
  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

// DELETE MULTIPLE REGISTRATIONS
router.delete("/delete", async (req, res) => {
  const { userIds } = req.body;

  // VALIDATE INPUT
  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ message: "User IDs are required and must be an array." });
  }

  try {
    // CREATE PLACEHOLDERS FOR THE IN CLAUSE
    const placeholders = userIds.map(() => '?').join(',');
    
    // FIRST CHECK IF ALL USERS EXIST
    const [existingUsers] = await pool.query(
      `SELECT user_id FROM users WHERE user_id IN (${placeholders})`,
      userIds
    );

    if (existingUsers.length !== userIds.length) {
      return res.status(404).json({ 
        message: "Some users not found.",
        found: existingUsers.map(u => u.user_id),
        requested: userIds
      });
    }

    // DELETE THE REGISTRATIONS
    const [result] = await pool.query(
      `DELETE FROM users WHERE user_id IN (${placeholders})`,
      userIds
    );

    if (result.affectedRows > 0) {
      res.status(200).json({ 
        message: `${result.affectedRows} registration(s) deleted successfully.`,
        deletedCount: result.affectedRows,
        deletedIds: userIds
      });
    } else {
      res.status(404).json({ message: "No registrations were deleted." });
    }
  } catch (error) {
    console.error("Error deleting registrations:", error);
    res.status(500).json({ message: "Internal server error while deleting registrations." });
  }
});

// DELETE SINGLE REGISTRATION
router.delete("/delete/:userId", async (req, res) => {
  const { userId } = req.params;

  // VALIDATE INPUT
  if (!userId || isNaN(userId)) {
    return res.status(400).json({ message: "Valid user ID is required." });
  }

  try {
    // CHECK IF USER EXISTS
    const [existingUser] = await pool.query(
      "SELECT user_id, first_name, last_name, email FROM users WHERE user_id = ?",
      [userId]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    // DELETE THE REGISTRATION
    const [result] = await pool.query(
      "DELETE FROM users WHERE user_id = ?",
      [userId]
    );

    if (result.affectedRows > 0) {
      res.status(200).json({ 
        message: "Registration deleted successfully.",
        deletedUser: existingUser[0]
      });
    } else {
      res.status(404).json({ message: "Registration could not be deleted." });
    }
  } catch (error) {
    console.error("Error deleting registration:", error);
    res.status(500).json({ message: "Internal server error while deleting registration." });
  }
});

module.exports = router;