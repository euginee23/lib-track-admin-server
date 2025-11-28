const { pool } = require('../config/database');

/**
 * Reusable Activity Logger Helper
 * 
 * This helper function can be called from any route to log activities
 * with optional admin context for tracking who performed admin actions.
 * 
 * @param {Object} params - Activity log parameters
 * @param {number} params.user_id - User ID (required)
 * @param {string} params.action - Action type (required)
 * @param {string} params.details - Activity details (optional)
 * @param {string} params.status - Status: 'completed', 'failed', 'pending' (default: 'completed')
 * @param {number} params.admin_id - Admin ID who performed the action (optional)
 * @param {string} params.admin_name - Admin name (optional, for details field)
 * @returns {Promise<Object>} Result with success status and log ID
 */
async function logActivity({
  user_id,
  action,
  details = null,
  status = 'completed',
  admin_id = null,
  admin_name = null
}) {
  try {
    // Validate required fields
    if (!user_id || !action) {
      throw new Error('user_id and action are required for activity logging');
    }

    // If admin info provided, append to details
    let finalDetails = details || '';
    if (admin_id && admin_name) {
      finalDetails += finalDetails ? ` | Admin: ${admin_name} (ID: ${admin_id})` : `Admin: ${admin_name} (ID: ${admin_id})`;
    } else if (admin_id) {
      finalDetails += finalDetails ? ` | Admin ID: ${admin_id}` : `Admin ID: ${admin_id}`;
    }

    // Insert activity log
    const [result] = await pool.execute(
      `INSERT INTO activity_logs (user_id, action, details, status, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [user_id, action, finalDetails || null, status]
    );

    return {
      success: true,
      activity_log_id: result.insertId,
      message: 'Activity logged successfully'
    };
  } catch (error) {
    console.error('Error logging activity:', error);
    // Return failure but don't throw - we don't want to break the main operation
    return {
      success: false,
      error: error.message,
      message: 'Failed to log activity'
    };
  }
}

/**
 * Log admin authentication events (login/logout)
 * 
 * @param {Object} params - Auth log parameters
 * @param {number} params.admin_id - Admin ID
 * @param {string} params.action - 'ADMIN_LOGIN' or 'ADMIN_LOGOUT'
 * @param {string} params.admin_name - Admin full name
 * @param {string} params.email - Admin email
 * @param {string} params.ip_address - IP address (optional)
 * @returns {Promise<Object>} Result
 */
async function logAdminAuth({
  admin_id,
  action,
  admin_name,
  email,
  ip_address = null
}) {
  try {
    if (!admin_id || !action || !email) {
      throw new Error('admin_id, action, and email are required');
    }

    let details = `${admin_name || 'Admin'} (${email})`;
    if (ip_address) {
      details += ` from IP: ${ip_address}`;
    }

    // For admin auth events, we'll use admin_id as user_id with special action prefix
    const [result] = await pool.execute(
      `INSERT INTO activity_logs (user_id, action, details, status, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [admin_id, action, details, 'completed']
    );

    return {
      success: true,
      activity_log_id: result.insertId,
      message: 'Admin auth logged successfully'
    };
  } catch (error) {
    console.error('Error logging admin auth:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to log admin auth'
    };
  }
}

/**
 * Log reservation activities
 * 
 * @param {Object} params - Reservation log parameters
 * @param {number} params.user_id - User ID
 * @param {string} params.action - 'RESERVATION_CREATED', 'RESERVATION_APPROVED', 'RESERVATION_REJECTED', etc.
 * @param {string} params.item_type - 'book' or 'research_paper'
 * @param {string} params.item_title - Title of the item
 * @param {number} params.reservation_id - Reservation ID
 * @param {number} params.admin_id - Admin ID who processed (optional)
 * @param {string} params.admin_name - Admin name (optional)
 * @param {string} params.reason - Reason for rejection/cancellation (optional)
 * @returns {Promise<Object>} Result
 */
async function logReservation({
  user_id,
  action,
  item_type,
  item_title,
  reservation_id,
  admin_id = null,
  admin_name = null,
  reason = null
}) {
  try {
    if (!user_id || !action || !item_type || !reservation_id) {
      throw new Error('user_id, action, item_type, and reservation_id are required');
    }

    let details = `${item_type === 'book' ? 'Book' : 'Research Paper'}: ${item_title || 'Unknown'} (Reservation #${reservation_id})`;
    
    if (reason) {
      details += ` | Reason: ${reason}`;
    }

    return await logActivity({
      user_id,
      action,
      details,
      status: 'completed',
      admin_id,
      admin_name
    });
  } catch (error) {
    console.error('Error logging reservation:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to log reservation'
    };
  }
}

/**
 * Log payment activities
 * 
 * @param {Object} params - Payment log parameters
 * @param {number} params.user_id - User ID
 * @param {string} params.action - 'PENALTY_PAID', 'PAYMENT_RECEIVED', etc.
 * @param {number} params.amount - Payment amount
 * @param {string} params.reference_number - Payment reference number
 * @param {number} params.penalty_id - Penalty ID (optional)
 * @param {number} params.admin_id - Admin ID who processed the payment (required for tracking)
 * @param {string} params.admin_name - Admin name (optional)
 * @returns {Promise<Object>} Result
 */
async function logPayment({
  user_id,
  action,
  amount,
  reference_number,
  penalty_id = null,
  admin_id,
  admin_name = null
}) {
  try {
    if (!user_id || !action || !amount || !reference_number || !admin_id) {
      throw new Error('user_id, action, amount, reference_number, and admin_id are required');
    }

    let details = `Payment of ₱${parseFloat(amount).toFixed(2)} - Reference: ${reference_number}`;
    
    if (penalty_id) {
      details += ` | Penalty ID: ${penalty_id}`;
    }

    return await logActivity({
      user_id,
      action,
      details,
      status: 'completed',
      admin_id,
      admin_name
    });
  } catch (error) {
    console.error('Error logging payment:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to log payment'
    };
  }
}

/**
 * Batch log multiple activities
 * Useful when multiple actions happen in a transaction
 * 
 * @param {Array<Object>} activities - Array of activity log parameters
 * @returns {Promise<Object>} Result with array of log IDs
 */
async function logActivitiesBatch(activities) {
  try {
    const results = [];
    
    for (const activity of activities) {
      const result = await logActivity(activity);
      results.push(result);
    }

    const successCount = results.filter(r => r.success).length;
    
    return {
      success: successCount === activities.length,
      total: activities.length,
      successful: successCount,
      failed: activities.length - successCount,
      results
    };
  } catch (error) {
    console.error('Error in batch activity logging:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to log activities in batch'
    };
  }
}

module.exports = {
  logActivity,
  logAdminAuth,
  logReservation,
  logPayment,
  logActivitiesBatch
};
