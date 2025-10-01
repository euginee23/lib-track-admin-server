const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");

// UPDATE LIBRARIAN APPROVAL STATUS
router.put("/registrations/:id/approval", async (req, res) => {
  const { id } = req.params;
  const { librarian_approval } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE users 
       SET librarian_approval = ?
       WHERE user_id = ?`,
      [librarian_approval, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({ message: "Librarian approval status updated successfully." });
  } catch (error) {
    console.error("Error updating librarian approval status:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

module.exports = router;
