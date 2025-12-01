const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");
const { sendRegistrationApprovalEmail, sendRegistrationDisapprovalEmail } = require("../smtp/registrationNotification");

// UPDATE LIBRARIAN APPROVAL STATUS
router.put("/registrations/:id/approval", async (req, res) => {
  const { id } = req.params;
  const { librarian_approval, disapproval_reason } = req.body;

  try {
    // First, get user details for email notification
    const [users] = await pool.query(
      `SELECT user_id, first_name, last_name, email, librarian_approval 
       FROM users 
       WHERE user_id = ?`,
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = users[0];
    const previousApproval = user.librarian_approval;

    // Update approval status
    const [result] = await pool.query(
      `UPDATE users 
       SET librarian_approval = ?
       WHERE user_id = ?`,
      [librarian_approval, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    // Send email notification based on approval status change
    try {
      if (librarian_approval === 1 && previousApproval !== 1) {
        // Approved - send approval email
        await sendRegistrationApprovalEmail(user.email, user.first_name, user.last_name);
        console.log(`Approval notification sent to ${user.email}`);
      } else if (librarian_approval === 0 && previousApproval === 1) {
        // Disapproved (was approved before) - send disapproval email
        await sendRegistrationDisapprovalEmail(user.email, user.first_name, user.last_name, disapproval_reason);
        console.log(`Disapproval notification sent to ${user.email}`);
      } else if (librarian_approval === 2) {
        // Status 2 = rejected/disapproved - send disapproval email
        await sendRegistrationDisapprovalEmail(user.email, user.first_name, user.last_name, disapproval_reason);
        console.log(`Rejection notification sent to ${user.email}`);
      }
    } catch (emailError) {
      // Log email error but don't fail the request
      console.error("Error sending notification email:", emailError);
    }

    res.status(200).json({ 
      message: "Librarian approval status updated successfully.",
      emailSent: true
    });
  } catch (error) {
    console.error("Error updating librarian approval status:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

module.exports = router;
