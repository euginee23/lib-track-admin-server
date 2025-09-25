const { sendEmail } = require("./nodemailer");
const { pool } = require("../config/database");
const { storeVerificationCode } = require("./verifyEmailVerification");

/**
 * Send a 6-digit verification code to the specified email address and store in database.
 * @param {string} toEmail - Recipient's email address
 * @param {string} [mainMessage] - Optional main message to include
 * @returns {Promise<string>} The verification code sent
 */
async function sendVerification(toEmail, mainMessage = "Please use the code below to verify your email address.") {
  try {
    // GET USER ID FROM EMAIL
    const [rows] = await pool.query(
      `SELECT user_id FROM users WHERE email = ?`,
      [toEmail]
    );

    if (rows.length === 0) {
      throw new Error("User not found");
    }

    const userId = rows[0].user_id;

    // GENERATE A RANDOM 6-DIGIT CODE
    const code = Math.floor(100000 + Math.random() * 900000).toString();

  // STORE VERIFICATION CODE IN DATABASE (THIS WILL DELETE ANY PREVIOUS CODES)
  await storeVerificationCode(userId, code, "Email Verification"); // Now uses verification_codes table

    // SEND EMAIL WITH VERIFICATION CODE
    await sendEmail(
      toEmail,
      "Lib-Track Email Verification",
      `Your verification code is: ${code}`,
      {
        mainMessage,
        code,
        codeLabel: "Your verification code is:",
        footerMessage: "If you didn't request this, you can ignore this email."
      }
    );

    return code;
  } catch (error) {
    console.error("Error sending verification:", error);
    throw error;
  }
}

module.exports = { sendVerification };
