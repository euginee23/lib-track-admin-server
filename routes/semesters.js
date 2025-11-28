const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");

// GET ALL SEMESTERS
router.get("/", async (req, res) => {
  try {
    const [semesters] = await pool.execute(
      `SELECT 
        semester_id,
        semester_name,
        school_year,
        start_date,
        end_date,
        is_active,
        created_at,
        updated_at
      FROM semesters
      ORDER BY 
        CASE 
          WHEN is_active = 1 THEN 0
          ELSE 1
        END,
        start_date DESC`
    );

    res.status(200).json({
      success: true,
      count: semesters.length,
      data: semesters,
    });
  } catch (error) {
    console.error("Error fetching semesters:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch semesters",
      error: error.message,
    });
  }
});

// GET ACTIVE SEMESTER
router.get("/active", async (req, res) => {
  try {
    const [semester] = await pool.execute(
      `SELECT 
        semester_id,
        semester_name,
        school_year,
        start_date,
        end_date,
        is_active,
        created_at
      FROM semesters
      WHERE is_active = 1
      LIMIT 1`
    );

    if (semester.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No active semester found",
      });
    }

    res.status(200).json({
      success: true,
      data: semester[0],
    });
  } catch (error) {
    console.error("Error fetching active semester:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch active semester",
      error: error.message,
    });
  }
});

// CREATE NEW SEMESTER
router.post("/", async (req, res) => {
  const { semester_name, school_year, start_date, end_date, is_active } = req.body;

  if (!semester_name || !school_year || !start_date || !end_date) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: semester_name, school_year, start_date, end_date",
    });
  }

  try {
    // If marking as active, deactivate all other semesters first
    if (is_active) {
      await pool.execute(`UPDATE semesters SET is_active = 0`);
    }

    const [result] = await pool.execute(
      `INSERT INTO semesters (semester_name, school_year, start_date, end_date, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [semester_name, school_year, start_date, end_date, is_active ? 1 : 0]
    );

    res.status(201).json({
      success: true,
      message: "Semester created successfully",
      semesterId: result.insertId,
    });
  } catch (error) {
    console.error("Error creating semester:", error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: "A semester with this name and school year already exists",
      });
    }
    res.status(500).json({
      success: false,
      message: "Failed to create semester",
      error: error.message,
    });
  }
});

// UPDATE SEMESTER
router.put("/:semester_id", async (req, res) => {
  const { semester_id } = req.params;
  const { semester_name, school_year, start_date, end_date, is_active } = req.body;

  if (!semester_id) {
    return res.status(400).json({
      success: false,
      message: "Semester ID is required",
    });
  }

  try {
    // If marking as active, deactivate all other semesters first
    if (is_active) {
      await pool.execute(`UPDATE semesters SET is_active = 0`);
    }

    const updateFields = [];
    const updateValues = [];

    if (semester_name !== undefined) {
      updateFields.push('semester_name = ?');
      updateValues.push(semester_name);
    }
    if (school_year !== undefined) {
      updateFields.push('school_year = ?');
      updateValues.push(school_year);
    }
    if (start_date !== undefined) {
      updateFields.push('start_date = ?');
      updateValues.push(start_date);
    }
    if (end_date !== undefined) {
      updateFields.push('end_date = ?');
      updateValues.push(end_date);
    }
    if (is_active !== undefined) {
      updateFields.push('is_active = ?');
      updateValues.push(is_active ? 1 : 0);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    updateValues.push(semester_id);

    const [result] = await pool.execute(
      `UPDATE semesters SET ${updateFields.join(', ')} WHERE semester_id = ?`,
      updateValues
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Semester not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Semester updated successfully",
    });
  } catch (error) {
    console.error("Error updating semester:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update semester",
      error: error.message,
    });
  }
});

// SET ACTIVE SEMESTER
router.put("/:semester_id/activate", async (req, res) => {
  const { semester_id } = req.params;

  try {
    // Deactivate all semesters first
    await pool.execute(`UPDATE semesters SET is_active = 0`);

    // Activate the selected semester
    const [result] = await pool.execute(
      `UPDATE semesters SET is_active = 1 WHERE semester_id = ?`,
      [semester_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Semester not found",
      });
    }

    // Update all students to the new active semester and reset their verification status
    const [studentUpdate] = await pool.execute(
      `UPDATE users 
       SET semester_id = ?, 
           semester_verified = 0, 
           semester_verified_at = NULL
       WHERE position = 'Student'`,
      [semester_id]
    );

    res.status(200).json({
      success: true,
      message: "Semester activated successfully",
      studentsUpdated: studentUpdate.affectedRows,
    });
  } catch (error) {
    console.error("Error activating semester:", error);
    res.status(500).json({
      success: false,
      message: "Failed to activate semester",
      error: error.message,
    });
  }
});

// DELETE SEMESTER
router.delete("/:semester_id", async (req, res) => {
  const { semester_id } = req.params;

  try {
    // Check if semester is active
    const [semester] = await pool.execute(
      `SELECT is_active FROM semesters WHERE semester_id = ?`,
      [semester_id]
    );

    if (semester.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Semester not found",
      });
    }

    if (semester[0].is_active === 1) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete an active semester. Please activate another semester first.",
      });
    }

    // Check if any users are linked to this semester
    const [users] = await pool.execute(
      `SELECT COUNT(*) as count FROM users WHERE semester_id = ?`,
      [semester_id]
    );

    if (users[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete semester. ${users[0].count} user(s) are registered under this semester.`,
        linkedUsers: users[0].count,
      });
    }

    const [result] = await pool.execute(
      `DELETE FROM semesters WHERE semester_id = ?`,
      [semester_id]
    );

    res.status(200).json({
      success: true,
      message: "Semester deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting semester:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete semester",
      error: error.message,
    });
  }
});

// GET USERS BY SEMESTER
router.get("/:semester_id/users", async (req, res) => {
  const { semester_id } = req.params;
  const { verification_status } = req.query; // 'verified', 'unverified', or 'all'

  try {
    let query = `
      SELECT 
        u.user_id,
        u.first_name,
        u.middle_name,
        u.last_name,
        u.email,
        u.student_id,
        u.faculty_id,
        u.position,
        u.semester_verified,
        u.semester_verified_at,
        d.department_name,
        d.department_acronym
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.department_id
      WHERE u.semester_id = ? AND u.librarian_approval = 1
    `;

    const params = [semester_id];

    if (verification_status === 'verified') {
      query += ` AND u.semester_verified = 1`;
    } else if (verification_status === 'unverified') {
      query += ` AND u.semester_verified = 0`;
    }

    query += ` ORDER BY u.semester_verified ASC, u.last_name ASC`;

    const [users] = await pool.execute(query, params);

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error("Error fetching semester users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch semester users",
      error: error.message,
    });
  }
});

// RESET SEMESTER VERIFICATION FOR ALL USERS (when new semester starts)
router.post("/:semester_id/reset-verification", async (req, res) => {
  const { semester_id } = req.params;

  try {
    const [result] = await pool.execute(
      `UPDATE users 
       SET semester_verified = 0, 
           semester_verified_at = NULL,
           semester_id = ?
       WHERE librarian_approval = 1`,
      [semester_id]
    );

    res.status(200).json({
      success: true,
      message: `Reset verification for ${result.affectedRows} user(s)`,
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    console.error("Error resetting semester verification:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reset semester verification",
      error: error.message,
    });
  }
});

// GET SEMESTER STATISTICS
router.get("/:semester_id/stats", async (req, res) => {
  const { semester_id } = req.params;

  try {
    const [stats] = await pool.execute(
      `SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN semester_verified = 1 THEN 1 ELSE 0 END) as verified_users,
        SUM(CASE WHEN semester_verified = 0 THEN 1 ELSE 0 END) as unverified_users,
        SUM(CASE WHEN position = 'Student' THEN 1 ELSE 0 END) as total_students,
        SUM(CASE WHEN position != 'Student' THEN 1 ELSE 0 END) as total_faculty
      FROM users
      WHERE semester_id = ? AND librarian_approval = 1`,
      [semester_id]
    );

    res.status(200).json({
      success: true,
      data: stats[0],
    });
  } catch (error) {
    console.error("Error fetching semester stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch semester statistics",
      error: error.message,
    });
  }
});

// ENROLL USER(S) FOR SEMESTER (Mark as verified)
router.post("/enroll", async (req, res) => {
  const { user_ids } = req.body;

  if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({
      success: false,
      message: "user_ids array is required and cannot be empty",
    });
  }

  try {
    // Get the active semester
    const [activeSemester] = await pool.execute(
      `SELECT semester_id FROM semesters WHERE is_active = 1 LIMIT 1`
    );

    if (activeSemester.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No active semester found. Please set an active semester first.",
      });
    }

    const activeSemesterId = activeSemester[0].semester_id;

    // Update users to be verified for the active semester
    const placeholders = user_ids.map(() => "?").join(",");
    const [result] = await pool.execute(
      `UPDATE users 
       SET semester_id = ?, 
           semester_verified = 1, 
           semester_verified_at = NOW()
       WHERE user_id IN (${placeholders}) AND librarian_approval = 1`,
      [activeSemesterId, ...user_ids]
    );

    res.status(200).json({
      success: true,
      message: `Successfully enrolled ${result.affectedRows} user(s) for the active semester`,
      enrolledCount: result.affectedRows,
      semesterId: activeSemesterId,
    });
  } catch (error) {
    console.error("Error enrolling users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to enroll users",
      error: error.message,
    });
  }
});

module.exports = router;
