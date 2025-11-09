const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

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

    // CHECK IF USER HAS A REGISTERED FINGERPRINT
    let hasFingerprint = false;
    try {
      const [fpRows] = await pool.query(
        `SELECT fingerprint_id FROM fingerprints WHERE user_id = ? LIMIT 1`,
        [user.user_id]
      );
      hasFingerprint = Array.isArray(fpRows) && fpRows.length > 0;
    } catch (fpErr) {
      console.error('Error checking fingerprints for user:', fpErr);
      // don't fail login over fingerprint check — default to false
      hasFingerprint = false;
    }

    // normalize to boolean and log for troubleshooting
    hasFingerprint = !!hasFingerprint;
    console.debug(`login: user_id=${user.user_id} hasFingerprint=${hasFingerprint}`);

    // GENERATE JWT TOKEN
    const tokenPayload = {
      userId: user.user_id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name
    };
    
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET || "your-secret-key", {
      expiresIn: "7d"
    });

    // PREPARE USER DATA
    const userData = {
      id: user.user_id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      studentId: user.student_id,
      contactNumber: user.contact_number,
      email_verification: user.email_verification,
      librarian_approval: user.librarian_approval,
      hasFingerprint: hasFingerprint
    };

  // CHECK IF THE USER IS APPROVED BY THE LIBRARIAN AND EMAIL IS VERIFIED
    if (user.email_verification === 0) {
        return res.status(403).json({ 
          message: "Please verify your email address.", 
          user: userData,
          token: token
        });
    }

    if (user.librarian_approval === 0) {
        return res.status(403).json({ 
          message: "Your account is pending librarian approval.", 
          user: userData,
          token: token
        });
    }

    // CHECK IF THE USER HAS A REGISTERED FINGERPRINT
    if (!hasFingerprint) {
      return res.status(403).json({
        message: "No fingerprint registered. Please enroll a fingerprint to continue.",
        user: userData,
        token: token
      });
    }

  // SUCCESSFUL LOGIN - BOTH EMAIL VERIFIED AND LIBRARIAN APPROVED
    res.status(200).json({
      message: "Login successful.",
      user: userData,
      token: token
    });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

module.exports = router;