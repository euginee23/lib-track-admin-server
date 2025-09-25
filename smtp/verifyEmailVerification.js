const { pool } = require("../config/database");

/**
 * Store verification code in database and remove any previous codes for the same user and type
 * @param {number} userId - User's ID
 * @param {string} code - 6-digit verification code
 * @param {string} verificationType - Type of verification (e.g., "Email Verification")
 */
async function storeVerificationCode(userId, code, verificationType = "Email Verification") {
  try {
    // DELETE ANY EXISTING VERIFICATION CODES FOR THIS USER AND TYPE
    await pool.query(
      `DELETE FROM verification_codes WHERE user_id = ? AND verification_type = ?`,
      [userId, verificationType]
    );

    // INSERT NEW VERIFICATION CODE
    await pool.query(
      `INSERT INTO verification_codes (user_id, code, verification_type, created_at) VALUES (?, ?, ?, NOW())`,
      [userId, code, verificationType]
    );
  } catch (error) {
    console.error("Error storing verification code:", error);
    throw error;
  }
}

/**
 * Verify the provided code against the database
 * @param {number} userId - User's ID
 * @param {string} code - 6-digit verification code to verify
 * @param {string} verificationType - Type of verification (e.g., "Email Verification")
 * @returns {Promise<boolean>} True if code is valid, false otherwise
 */
async function verifyCode(userId, code, verificationType = "Email Verification") {
  try {
    console.log("Verifying code for:", { userId, code, verificationType });
    
    // GET THE LATEST VERIFICATION CODE FOR THIS USER AND TYPE
    const [rows] = await pool.query(
      `SELECT code, created_at FROM verification_codes 
       WHERE user_id = ? AND verification_type = ? 
       ORDER BY created_at DESC LIMIT 1`,
      [userId, verificationType]
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
      console.log("Code matches! Updating user and deleting code");
      // DELETE USED VERIFICATION CODE
      await pool.query(
        `DELETE FROM verification_codes WHERE user_id = ? AND verification_type = ?`,
        [userId, verificationType]
      );
      
      // UPDATE USER'S EMAIL VERIFICATION STATUS
      await pool.query(
        `UPDATE users SET email_verification = 1 WHERE user_id = ?`,
        [userId]
      );
      
      return true;
    }

    console.log("Code does not match");
    return false;
  } catch (error) {
    console.error("Error verifying code:", error);
    throw error;
  }
}

module.exports = { storeVerificationCode, verifyCode };
