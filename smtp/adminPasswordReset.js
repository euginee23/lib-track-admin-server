const { sendEmail } = require("./nodemailer");
const { pool } = require("../config/database");

/**
 * Store verification code for admin password reset in database
 * @param {number} adminId - Admin's ID
 * @param {string} code - 6-digit verification code
 * @param {string} verificationType - Type of verification (e.g., "Admin Password Reset")
 */
async function storeAdminVerificationCode(adminId, code, verificationType = "Admin Password Reset") {
  try {
    // DELETE ANY EXISTING VERIFICATION CODES FOR THIS ADMIN AND TYPE
    await pool.query(
      `DELETE FROM verification_codes WHERE user_id = ? AND verification_type = ?`,
      [adminId, verificationType]
    );

    // INSERT NEW VERIFICATION CODE
    await pool.query(
      `INSERT INTO verification_codes (user_id, code, verification_type, created_at) VALUES (?, ?, ?, NOW())`,
      [adminId, code, verificationType]
    );
  } catch (error) {
    console.error("Error storing admin verification code:", error);
    throw error;
  }
}

/**
 * Verify the provided code for admin password reset
 * @param {number} adminId - Admin's ID
 * @param {string} code - 6-digit verification code to verify
 * @param {string} verificationType - Type of verification (e.g., "Admin Password Reset")
 * @returns {Promise<boolean>} True if code is valid, false otherwise
 */
async function verifyAdminCode(adminId, code, verificationType = "Admin Password Reset") {
  try {
    console.log("Verifying admin reset code for:", { adminId, code, verificationType });
    
    // GET THE LATEST VERIFICATION CODE FOR THIS ADMIN AND TYPE
    const [rows] = await pool.query(
      `SELECT code, created_at FROM verification_codes 
       WHERE user_id = ? AND verification_type = ? 
       ORDER BY created_at DESC LIMIT 1`,
      [adminId, verificationType]
    );

    console.log("Database query result:", rows);

    if (rows.length === 0) {
      console.log("No verification code found");
      return false; // No verification code found
    }

    const storedCode = rows[0].code;
    console.log("Comparing codes:", { storedCode, providedCode: code });

    // VERIFY CODE MATCHES
    if (storedCode === code) {
      console.log("Code matches! Deleting code");
      // DELETE USED VERIFICATION CODE
      await pool.query(
        `DELETE FROM verification_codes WHERE user_id = ? AND verification_type = ?`,
        [adminId, verificationType]
      );
      
      return true;
    }

    console.log("Code does not match");
    return false;
  } catch (error) {
    console.error("Error verifying admin code:", error);
    throw error;
  }
}

/**
 * Send a password reset verification code to the specified admin email
 * @param {string} toEmail - Admin's email address
 * @returns {Promise<string>} The verification code sent
 */
async function sendAdminPasswordReset(toEmail) {
  try {
    // GET ADMIN ID FROM EMAIL
    const [rows] = await pool.query(
      `SELECT admin_id, first_name, last_name, status FROM administrators WHERE email = ?`,
      [toEmail]
    );

    if (rows.length === 0) {
      throw new Error("Administrator not found");
    }

    const admin = rows[0];

    // CHECK IF ADMIN IS ACTIVE
    if (admin.status !== 'Active') {
      throw new Error("Your account is inactive. Please contact a Super Admin.");
    }

    const adminId = admin.admin_id;
    const adminName = `${admin.first_name} ${admin.last_name}`;

    // GENERATE A RANDOM 6-DIGIT CODE
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // STORE VERIFICATION CODE IN DATABASE
    await storeAdminVerificationCode(adminId, code, "Admin Password Reset");

    // SEND EMAIL WITH VERIFICATION CODE
    await sendEmail(
      toEmail,
      "Lib-Track Admin Password Reset",
      `Your password reset verification code is: ${code}`,
      {
        title: "Password Reset Request",
        mainMessage: `Hello ${adminName}, we received a request to reset your administrator account password.`,
        code,
        codeLabel: "Your verification code is:",
        footerMessage: "If you didn't request this password reset, you can ignore this email. The code will expire when you request a new one."
      }
    );

    return code;
  } catch (error) {
    console.error("Error sending admin password reset:", error);
    throw error;
  }
}

module.exports = { 
  storeAdminVerificationCode, 
  verifyAdminCode, 
  sendAdminPasswordReset 
};