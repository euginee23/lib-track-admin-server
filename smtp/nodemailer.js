const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendEmail = async (to, subject, content, options = {}) => {
  try {
    const {
      title = "Lib-Track Notification",
      mainMessage = "",
      code = null,
      codeLabel = "Your verification code is:",
      footerMessage = "If you didn't request this, you can ignore this email.",
      customHtml = null
    } = options;

    const htmlContent = customHtml || `
      <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 20px;">
        <div style="max-width: 480px; margin: auto; background: #ffffff; border-radius: 8px; padding: 24px; box-shadow: 0 2px 6px rgba(0,0,0,0.05);">
          <h2 style="margin-top: 0; color: #0A7075;">${title}</h2>
          ${mainMessage ? `<p style="font-size: 14px; color: #333;">${mainMessage}</p>` : ''}
          ${content ? `<p style="font-size: 14px; color: #333;">${content}</p>` : ''}
          ${code ? `
            <p style="font-size: 14px; color: #333;">${codeLabel}</p>
            <div style="text-align: center; margin: 20px 0;">
              <span style="display: inline-block; font-size: 28px; font-weight: bold; color: #333; letter-spacing: 8px; background: #f3f3f3; padding: 12px 20px; border-radius: 6px;">
                ${code}
              </span>
            </div>
            <p style="font-size: 13px; color: #666; text-align: center;">This code is valid until you request a new one.</p>
          ` : ''}
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;" />
          <p style="font-size: 12px; color: #999; text-align: center;">${footerMessage}</p>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: `"Lib-Track" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text: content,
      html: htmlContent,
    });

    console.log("Email sent: " + info.response);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

module.exports = { sendEmail };