const { sendEmail } = require("./nodemailer");

/**
 * Send penalty due reminder (1 day before due date)
 * @param {string} email - User's email
 * @param {string} userName - User's name
 * @param {object} transaction - Transaction details
 */
const sendPenaltyDueReminder = async (email, userName, transaction) => {
  try {
    const subject = "⚠️ Item Due Tomorrow - Lib-Track Reminder";
    const itemTitle = transaction.book_title || transaction.research_title || 'Item';
    const dueDate = new Date(transaction.due_date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    
    const customHtml = `
      <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 20px;">
        <div style="max-width: 600px; margin: auto; background: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #0A7075; margin: 0;">Lib-Track</h1>
            <p style="color: #666; margin: 8px 0 0 0; font-size: 14px;">Western Mindanao State University Library System</p>
          </div>
          
          <div style="background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%); padding: 24px; border-radius: 8px; text-align: center; margin-bottom: 24px;">
            <h2 style="color: white; margin: 0; font-size: 24px;">⚠️ Item Due Tomorrow</h2>
          </div>
          
          <p style="font-size: 15px; color: #333; line-height: 1.6;">
            Dear <strong>${userName}</strong>,
          </p>
          
          <p style="font-size: 15px; color: #333; line-height: 1.6;">
            This is a friendly reminder that the following item is <strong>due tomorrow</strong>:
          </p>
          
          <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #ffc107;">
            <h3 style="margin: 0 0 12px 0; color: #856404; font-size: 16px;">📚 Item Details</h3>
            <table style="width: 100%; font-size: 14px; color: #333;">
              <tr>
                <td style="padding: 4px 0;"><strong>Title:</strong></td>
                <td style="padding: 4px 0;">${itemTitle}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;"><strong>Reference:</strong></td>
                <td style="padding: 4px 0;">${transaction.reference_number}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;"><strong>Due Date:</strong></td>
                <td style="padding: 4px 0; color: #dc3545; font-weight: bold;">${dueDate}</td>
              </tr>
            </table>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #0A7075;">
            <h3 style="margin: 0 0 12px 0; color: #0A7075; font-size: 16px;">Important Reminders:</h3>
            <ul style="margin: 0; padding-left: 20px; color: #333; font-size: 14px; line-height: 1.8;">
              <li>Please return the item by the due date to avoid penalties</li>
              <li><strong>Books:</strong> ₱5 per day overdue fine</li>
              <li><strong>Research Papers:</strong> ₱10 per day overdue fine</li>
              <li>Maximum penalty of ₱200 per item</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 32px 0;">
            <p style="font-size: 14px; color: #666; margin-bottom: 16px;">Return the item at the library counter during operating hours</p>
          </div>
          
          <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;" />
          
          <p style="font-size: 13px; color: #999; text-align: center; margin: 0;">
            For questions or concerns, please visit the library or contact the library staff.
          </p>
          
          <p style="font-size: 13px; color: #999; text-align: center; margin: 8px 0 0 0;">
            This is an automated reminder from Lib-Track Library Management System.
          </p>
        </div>
      </div>
    `;

    await sendEmail(
      email,
      subject,
      `Dear ${userName},\n\nYour borrowed item "${itemTitle}" (Ref: ${transaction.reference_number}) is due tomorrow on ${dueDate}.\n\nPlease return it on time to avoid penalties.\n\nThank you!`,
      { customHtml }
    );

    console.log(`Due reminder email sent to ${email} for ${transaction.reference_number}`);
    return true;
  } catch (error) {
    console.error("Error sending due reminder email:", error);
    throw error;
  }
};

/**
 * Send overdue penalty notification
 * @param {string} email - User's email
 * @param {string} userName - User's name
 * @param {object} penalty - Penalty details
 */
const sendOverduePenaltyNotification = async (email, userName, penalty) => {
  try {
    const subject = "⚠️ Overdue Fine Notice - Lib-Track";
    const itemTitle = penalty.book_title || penalty.research_title || 'Item';
    const daysOverdue = penalty.days_overdue || 0;
    const fineAmount = parseFloat(penalty.fine || 0).toFixed(2);
    
    const customHtml = `
      <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 20px;">
        <div style="max-width: 600px; margin: auto; background: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #0A7075; margin: 0;">Lib-Track</h1>
            <p style="color: #666; margin: 8px 0 0 0; font-size: 14px;">Western Mindanao State University Library System</p>
          </div>
          
          <div style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); padding: 24px; border-radius: 8px; text-align: center; margin-bottom: 24px;">
            <h2 style="color: white; margin: 0; font-size: 24px;">⚠️ Overdue Fine Notice</h2>
          </div>
          
          <p style="font-size: 15px; color: #333; line-height: 1.6;">
            Dear <strong>${userName}</strong>,
          </p>
          
          <p style="font-size: 15px; color: #333; line-height: 1.6;">
            You have an <strong>overdue item</strong> in your account. Please return it as soon as possible to minimize penalties.
          </p>
          
          <div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #dc3545;">
            <h3 style="margin: 0 0 12px 0; color: #721c24; font-size: 16px;">📚 Overdue Item</h3>
            <table style="width: 100%; font-size: 14px; color: #333;">
              <tr>
                <td style="padding: 4px 0; width: 140px;"><strong>Title:</strong></td>
                <td style="padding: 4px 0;">${itemTitle}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;"><strong>Reference:</strong></td>
                <td style="padding: 4px 0;">${penalty.reference_number}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;"><strong>Days Overdue:</strong></td>
                <td style="padding: 4px 0; color: #dc3545; font-weight: bold;">${daysOverdue} days</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;"><strong>Current Fine:</strong></td>
                <td style="padding: 4px 0; color: #dc3545; font-weight: bold; font-size: 18px;">₱${fineAmount}</td>
              </tr>
            </table>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #0A7075;">
            <h3 style="margin: 0 0 12px 0; color: #0A7075; font-size: 16px;">What You Need to Do:</h3>
            <ul style="margin: 0; padding-left: 20px; color: #333; font-size: 14px; line-height: 1.8;">
              <li><strong>Return the item immediately</strong> to stop additional fines</li>
              <li>Pay the overdue fine at the library counter</li>
              <li>Fines continue to accumulate daily until the item is returned</li>
              <li>Maximum fine is ₱200 per item</li>
              <li>Unpaid fines may result in account restrictions</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 32px 0; background: #fff3cd; padding: 16px; border-radius: 6px;">
            <p style="font-size: 14px; color: #856404; margin: 0; font-weight: 600;">
              ⏰ Return your item today to prevent further charges
            </p>
          </div>
          
          <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;" />
          
          <p style="font-size: 13px; color: #999; text-align: center; margin: 0;">
            For questions or to arrange payment, please visit the library or contact the library staff.
          </p>
          
          <p style="font-size: 13px; color: #999; text-align: center; margin: 8px 0 0 0;">
            This is an automated notification from Lib-Track Library Management System.
          </p>
        </div>
      </div>
    `;

    await sendEmail(
      email,
      subject,
      `Dear ${userName},\n\nYou have an overdue item: "${itemTitle}" (Ref: ${penalty.reference_number})\n\nDays Overdue: ${daysOverdue} days\nCurrent Fine: ₱${fineAmount}\n\nPlease return the item and pay the fine at the library.\n\nThank you!`,
      { customHtml }
    );

    console.log(`Overdue penalty email sent to ${email} for ${penalty.reference_number}`);
    return true;
  } catch (error) {
    console.error("Error sending overdue penalty email:", error);
    throw error;
  }
};

/**
 * Send manual reminder for penalty
 * @param {string} email - User's email
 * @param {string} userName - User's name
 * @param {object} penalty - Penalty details
 */
const sendManualPenaltyReminder = async (email, userName, penalty) => {
  try {
    const subject = "📢 Payment Reminder - Lib-Track";
    const itemTitle = penalty.book_title || penalty.research_title || 'Item';
    const daysOverdue = penalty.days_overdue || 0;
    const fineAmount = parseFloat(penalty.fine || 0).toFixed(2);
    
    const customHtml = `
      <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 20px;">
        <div style="max-width: 600px; margin: auto; background: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #0A7075; margin: 0;">Lib-Track</h1>
            <p style="color: #666; margin: 8px 0 0 0; font-size: 14px;">Western Mindanao State University Library System</p>
          </div>
          
          <div style="background: linear-gradient(135deg, #0A7075 0%, #0d9099 100%); padding: 24px; border-radius: 8px; text-align: center; margin-bottom: 24px;">
            <h2 style="color: white; margin: 0; font-size: 24px;">📢 Payment Reminder</h2>
          </div>
          
          <p style="font-size: 15px; color: #333; line-height: 1.6;">
            Dear <strong>${userName}</strong>,
          </p>
          
          <p style="font-size: 15px; color: #333; line-height: 1.6;">
            This is a friendly reminder from the library staff regarding your outstanding fine. Please settle your payment at your earliest convenience.
          </p>
          
          <div style="background: #e7f3f8; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #0A7075;">
            <h3 style="margin: 0 0 12px 0; color: #0A7075; font-size: 16px;">📋 Payment Details</h3>
            <table style="width: 100%; font-size: 14px; color: #333;">
              <tr>
                <td style="padding: 4px 0; width: 140px;"><strong>Item:</strong></td>
                <td style="padding: 4px 0;">${itemTitle}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;"><strong>Reference:</strong></td>
                <td style="padding: 4px 0;">${penalty.reference_number}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;"><strong>Days Overdue:</strong></td>
                <td style="padding: 4px 0;">${daysOverdue} days</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;"><strong>Amount Due:</strong></td>
                <td style="padding: 4px 0; color: #0A7075; font-weight: bold; font-size: 18px;">₱${fineAmount}</td>
              </tr>
            </table>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #ffc107;">
            <h3 style="margin: 0 0 12px 0; color: #856404; font-size: 16px;">💡 Payment Instructions:</h3>
            <ul style="margin: 0; padding-left: 20px; color: #333; font-size: 14px; line-height: 1.8;">
              <li>Visit the library front desk during operating hours</li>
              <li>Inform the staff about your reference number</li>
              <li>Pay the fine amount in cash</li>
              <li>Keep your receipt for your records</li>
              <li>Your account will be updated immediately after payment</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 32px 0;">
            <p style="font-size: 14px; color: #666; margin: 0;">
              Thank you for your prompt attention to this matter.
            </p>
          </div>
          
          <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;" />
          
          <p style="font-size: 13px; color: #999; text-align: center; margin: 0;">
            If you have already paid or have any questions, please contact the library staff.
          </p>
          
          <p style="font-size: 13px; color: #999; text-align: center; margin: 8px 0 0 0;">
            This reminder was sent by the library staff via Lib-Track Library Management System.
          </p>
        </div>
      </div>
    `;

    await sendEmail(
      email,
      subject,
      `Dear ${userName},\n\nReminder: You have an outstanding fine for "${itemTitle}" (Ref: ${penalty.reference_number})\n\nAmount Due: ₱${fineAmount}\n\nPlease settle your payment at the library counter.\n\nThank you!`,
      { customHtml }
    );

    console.log(`Manual reminder email sent to ${email} for ${penalty.reference_number}`);
    return true;
  } catch (error) {
    console.error("Error sending manual reminder email:", error);
    throw error;
  }
};

module.exports = {
  sendPenaltyDueReminder,
  sendOverduePenaltyNotification,
  sendManualPenaltyReminder
};
