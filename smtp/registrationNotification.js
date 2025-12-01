const { sendEmail } = require("./nodemailer");

/**
 * Send registration approval notification
 * @param {string} email - User's email
 * @param {string} firstName - User's first name
 * @param {string} lastName - User's last name
 */
const sendRegistrationApprovalEmail = async (email, firstName, lastName) => {
  try {
    const subject = "Registration Approved - Lib-Track";
    const userName = `${firstName} ${lastName}`;
    
    const customHtml = `
      <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 20px;">
        <div style="max-width: 600px; margin: auto; background: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #0A7075; margin: 0;">Lib-Track</h1>
            <p style="color: #666; margin: 8px 0 0 0; font-size: 14px;">Western Mindanao State University Library System</p>
          </div>
          
          <div style="background: linear-gradient(135deg, #0A7075 0%, #0d9099 100%); padding: 24px; border-radius: 8px; text-align: center; margin-bottom: 24px;">
            <h2 style="color: white; margin: 0; font-size: 24px;">✓ Registration Approved!</h2>
          </div>
          
          <p style="font-size: 15px; color: #333; line-height: 1.6;">
            Dear <strong>${userName}</strong>,
          </p>
          
          <p style="font-size: 15px; color: #333; line-height: 1.6;">
            We are pleased to inform you that your registration for the Lib-Track library system has been <strong>approved</strong> by the librarian.
          </p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #0A7075;">
            <h3 style="margin: 0 0 12px 0; color: #0A7075; font-size: 16px;">What's Next?</h3>
            <ul style="margin: 0; padding-left: 20px; color: #333; font-size: 14px; line-height: 1.8;">
              <li>You can now log in to your account at the library kiosk or online portal</li>
              <li>Start browsing and borrowing books from our collection</li>
              <li>Access research papers and other library resources</li>
              <li>Manage your transactions and reservations</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="${process.env.USER_FRONTEND_URL || 'http://localhost:5174'}" 
               style="display: inline-block; background: #0A7075; color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 15px;">
              Access Your Account
            </a>
          </div>
          
          <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;" />
          
          <p style="font-size: 13px; color: #999; text-align: center; margin: 0;">
            If you have any questions, please visit the library or contact the library staff.
          </p>
          
          <p style="font-size: 13px; color: #999; text-align: center; margin: 8px 0 0 0;">
            This is an automated message from Lib-Track Library Management System.
          </p>
        </div>
      </div>
    `;

    await sendEmail(
      email,
      subject,
      `Dear ${userName},\n\nYour registration has been approved. You can now access the library system.\n\nThank you!`,
      { customHtml }
    );

    console.log(`Approval email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Error sending approval email:", error);
    throw error;
  }
};

/**
 * Send registration disapproval notification
 * @param {string} email - User's email
 * @param {string} firstName - User's first name
 * @param {string} lastName - User's last name
 * @param {string} reason - Optional reason for disapproval
 */
const sendRegistrationDisapprovalEmail = async (email, firstName, lastName, reason = null) => {
  try {
    const subject = "Registration Update - Lib-Track";
    const userName = `${firstName} ${lastName}`;
    
    const customHtml = `
      <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 20px;">
        <div style="max-width: 600px; margin: auto; background: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #0A7075; margin: 0;">Lib-Track</h1>
            <p style="color: #666; margin: 8px 0 0 0; font-size: 14px;">Western Mindanao State University Library System</p>
          </div>
          
          <div style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); padding: 24px; border-radius: 8px; text-align: center; margin-bottom: 24px;">
            <h2 style="color: white; margin: 0; font-size: 24px;">Registration Not Approved</h2>
          </div>
          
          <p style="font-size: 15px; color: #333; line-height: 1.6;">
            Dear <strong>${userName}</strong>,
          </p>
          
          <p style="font-size: 15px; color: #333; line-height: 1.6;">
            We regret to inform you that your registration for the Lib-Track library system could not be approved at this time.
          </p>
          
          ${reason ? `
            <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #ffc107;">
              <h3 style="margin: 0 0 12px 0; color: #856404; font-size: 16px;">Reason:</h3>
              <p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.6;">
                ${reason}
              </p>
            </div>
          ` : ''}
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #0A7075;">
            <h3 style="margin: 0 0 12px 0; color: #0A7075; font-size: 16px;">What You Can Do:</h3>
            <ul style="margin: 0; padding-left: 20px; color: #333; font-size: 14px; line-height: 1.8;">
              <li>Review the information you provided during registration</li>
              <li>Visit the library in person to clarify any issues</li>
              <li>Contact the library staff for more information</li>
              <li>You may submit a new registration if needed</li>
            </ul>
          </div>
          
          <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;" />
          
          <p style="font-size: 13px; color: #999; text-align: center; margin: 0;">
            For assistance, please visit the library during operating hours or contact the library staff.
          </p>
          
          <p style="font-size: 13px; color: #999; text-align: center; margin: 8px 0 0 0;">
            This is an automated message from Lib-Track Library Management System.
          </p>
        </div>
      </div>
    `;

    const plainText = `Dear ${userName},\n\nYour registration could not be approved at this time.${reason ? `\n\nReason: ${reason}` : ''}\n\nPlease visit the library for more information.\n\nThank you.`;

    await sendEmail(
      email,
      subject,
      plainText,
      { customHtml }
    );

    console.log(`Disapproval email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Error sending disapproval email:", error);
    throw error;
  }
};

module.exports = {
  sendRegistrationApprovalEmail,
  sendRegistrationDisapprovalEmail
};
