const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

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

// GET USER PROFILE ROUTE (Enhanced)
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get comprehensive user data with department and semester info
    const [rows] = await pool.query(
      `SELECT 
        u.*,
        d.department_name,
        d.department_acronym,
        s.semester_name,
        s.school_year,
        s.is_active as semester_is_active
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.department_id
      LEFT JOIN semesters s ON u.semester_id = s.semester_id
      WHERE u.user_id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = rows[0];

    // Check if user has a registered fingerprint
    let hasFingerprint = false;
    try {
      const [fpRows] = await pool.query(
        `SELECT fingerprint_id FROM fingerprints WHERE user_id = ? LIMIT 1`,
        [user.user_id]
      );
      hasFingerprint = Array.isArray(fpRows) && fpRows.length > 0;
    } catch (fpErr) {
      console.error('Error checking fingerprints for profile:', fpErr);
      hasFingerprint = false;
    }

    // Convert BLOB images to base64
    let profilePhotoBase64 = null;
    let corImageBase64 = null;

    if (user.profile_photo) {
      profilePhotoBase64 = `data:image/jpeg;base64,${Buffer.from(user.profile_photo).toString('base64')}`;
    }

    if (user.cor || user.cor_image) {
      const corData = user.cor || user.cor_image;
      corImageBase64 = `data:image/jpeg;base64,${Buffer.from(corData).toString('base64')}`;
    }

    // Prepare comprehensive user data
    const userData = {
      id: user.user_id,
      firstName: user.first_name,
      middleName: user.middle_name,
      lastName: user.last_name,
      email: user.email,
      contactNumber: user.contact_number,
      studentId: user.student_id,
      facultyId: user.faculty_id,
      position: user.position,
      yearLevel: user.year_level,
      departmentId: user.department_id,
      departmentName: user.department_name,
      departmentAcronym: user.department_acronym,
      semesterId: user.semester_id,
      semesterName: user.semester_name,
      schoolYear: user.school_year,
      semesterIsActive: user.semester_is_active,
      semesterVerified: user.semester_verified,
      semesterVerifiedAt: user.semester_verified_at,
      profileImage: profilePhotoBase64,
      profilePhoto: profilePhotoBase64,
      corImage: corImageBase64,
      email_verification: user.email_verification,
      librarian_approval: user.librarian_approval,
      hasFingerprint: !!hasFingerprint,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    };

    res.status(200).json({
      success: true,
      message: "Profile retrieved successfully.",
      user: userData
    });

  } catch (error) {
    console.error("Error retrieving profile:", error);
    res.status(500).json({ 
      success: false,
      message: "Internal server error." 
    });
  }
});

// UPDATE USER PROFILE ROUTE
router.put("/profile/update", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      first_name,
      middle_name,
      last_name,
      email,
      contact_number,
      student_id,
      faculty_id,
      position,
      department_id,
      year_level
    } = req.body;

    // Validate required fields
    if (!first_name || !last_name || !email || !position || !department_id) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: first_name, last_name, email, position, department_id"
      });
    }

    // Position-specific validation
    if (position === 'Student' && !student_id) {
      return res.status(400).json({
        success: false,
        message: "Student ID is required for student position"
      });
    }

    if (position !== 'Student' && !faculty_id) {
      return res.status(400).json({
        success: false,
        message: "Faculty ID is required for non-student positions"
      });
    }

    // Check if email is already taken by another user
    const [emailCheck] = await pool.query(
      `SELECT user_id FROM users WHERE email = ? AND user_id != ?`,
      [email, userId]
    );

    if (emailCheck.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email address is already in use by another user"
      });
    }

    // Check if student_id is already taken (if applicable)
    if (position === 'Student' && student_id) {
      const [studentIdCheck] = await pool.query(
        `SELECT user_id FROM users WHERE student_id = ? AND user_id != ?`,
        [student_id, userId]
      );

      if (studentIdCheck.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Student ID is already in use by another user"
        });
      }
    }

    // Check if faculty_id is already taken (if applicable)
    if (position !== 'Student' && faculty_id) {
      const [facultyIdCheck] = await pool.query(
        `SELECT user_id FROM users WHERE faculty_id = ? AND user_id != ?`,
        [faculty_id, userId]
      );

      if (facultyIdCheck.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Faculty ID is already in use by another user"
        });
      }
    }

    // Verify department exists
    const [departmentCheck] = await pool.query(
      `SELECT department_id FROM departments WHERE department_id = ?`,
      [department_id]
    );

    if (departmentCheck.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid department selected"
      });
    }

    // Update user profile
    const [result] = await pool.execute(
      `UPDATE users SET 
        first_name = ?,
        middle_name = ?,
        last_name = ?,
        email = ?,
        contact_number = ?,
        student_id = ?,
        faculty_id = ?,
        position = ?,
        department_id = ?,
        year_level = ?,
        updated_at = NOW()
      WHERE user_id = ?`,
      [
        first_name.trim(),
        middle_name ? middle_name.trim() : null,
        last_name.trim(),
        email.trim(),
        contact_number ? contact_number.trim() : null,
        position === 'Student' ? student_id.trim() : null,
        position !== 'Student' ? faculty_id.trim() : null,
        position,
        department_id,
        position === 'Student' ? (year_level || null) : null,
        userId
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully"
    });

  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// CHANGE PASSWORD ROUTE
router.post("/profile/change-password", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required"
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters long"
      });
    }

    // Get current password hash
    const [userRows] = await pool.query(
      `SELECT password FROM users WHERE user_id = ?`,
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, userRows[0].password);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect"
      });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    const [result] = await pool.execute(
      `UPDATE users SET password = ?, updated_at = NOW() WHERE user_id = ?`,
      [hashedNewPassword, userId]
    );

    res.status(200).json({
      success: true,
      message: "Password changed successfully"
    });

  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// UPDATE PROFILE IMAGE URL ROUTE
router.post("/profile/update-image", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { profile_image } = req.body;

    if (!profile_image) {
      return res.status(400).json({
        success: false,
        message: "Profile image URL is required"
      });
    }

    // Update profile image URL
    const [result] = await pool.execute(
      `UPDATE users SET profile_image = ?, updated_at = NOW() WHERE user_id = ?`,
      [profile_image, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Profile image updated successfully"
    });

  } catch (error) {
    console.error("Error updating profile image:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// UPDATE COR IMAGE ROUTE
router.post("/profile/update-cor", authenticateToken, (req, res) => {
  const upload = req.upload.single('corImage');
  
  upload(req, res, async (err) => {
    try {
      if (err) {
        return res.status(400).json({
          success: false,
          message: "Error uploading file: " + err.message
        });
      }

      const userId = req.user.userId;

      // Check if a file was uploaded
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "COR image is required"
        });
      }

      const corImageFile = req.file;

      // Validate file size (5MB max)
      if (corImageFile.size > 5 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: "File size must be less than 5MB"
        });
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(corImageFile.mimetype)) {
        return res.status(400).json({
          success: false,
          message: "Only JPG, JPEG, and PNG files are allowed"
        });
      }

      // Get the active semester
      const [activeSemester] = await pool.query(
        `SELECT semester_id FROM semesters WHERE is_active = 1 LIMIT 1`
      );

      if (activeSemester.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No active semester found"
        });
      }

      const activeSemesterId = activeSemester[0].semester_id;

      // Use the buffer from multer for BLOB storage
      const corImageBuffer = corImageFile.buffer;

      // Update user's COR image and reset semester verification
      const [result] = await pool.execute(
        `UPDATE users SET 
          cor = ?,
          semester_id = ?,
          semester_verified = 0,
          semester_verified_at = NULL,
          updated_at = NOW()
        WHERE user_id = ?`,
        [corImageBuffer, activeSemesterId, userId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      res.status(200).json({
        success: true,
        message: "COR uploaded successfully. Pending verification by librarian."
      });

    } catch (error) {
      console.error("Error updating COR:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  });
});

// UPDATE SEMESTER VERIFICATION ROUTE
router.post("/profile/update-semester", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { semester_id } = req.body;

    if (!semester_id) {
      return res.status(400).json({
        success: false,
        message: "Semester ID is required"
      });
    }

    // Verify semester exists and is active
    const [semesterCheck] = await pool.query(
      `SELECT semester_id, is_active FROM semesters WHERE semester_id = ?`,
      [semester_id]
    );

    if (semesterCheck.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid semester selected"
      });
    }

    if (!semesterCheck[0].is_active) {
      return res.status(400).json({
        success: false,
        message: "Selected semester is not active"
      });
    }

    // Update user's semester (they will need admin verification later)
    const [result] = await pool.execute(
      `UPDATE users SET 
        semester_id = ?, 
        semester_verified = 0, 
        semester_verified_at = NULL,
        updated_at = NOW()
      WHERE user_id = ?`,
      [semester_id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Semester updated successfully. Please wait for admin verification."
    });

  } catch (error) {
    console.error("Error updating semester:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

module.exports = router;