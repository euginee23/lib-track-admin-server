const { pool } = require("../config/database");
const { 
  sendPenaltyDueReminder, 
  sendOverduePenaltyNotification 
} = require("../smtp/penaltyNotification");

let wsServer = null;

// Set WebSocket server instance
const setWebSocketServer = (server) => {
  wsServer = server;
};

/**
 * Check for items due tomorrow and send reminders
 */
const checkDueTomorrowReminders = async () => {
  try {
    console.log('[Penalty Scheduler] Checking for items due tomorrow...');
    
    // Get transactions that are due tomorrow and not yet returned
    const [transactions] = await pool.execute(
      `SELECT 
        t.transaction_id,
        t.reference_number,
        t.due_date,
        t.book_id,
        t.research_paper_id,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        u.user_id,
        u.email,
        b.book_title,
        rp.research_title
       FROM transactions t
       LEFT JOIN users u ON t.user_id = u.user_id
       LEFT JOIN books b ON t.book_id = b.book_id
       LEFT JOIN research_papers rp ON t.research_paper_id = rp.research_paper_id
       WHERE t.status = 'Borrowed'
         AND t.due_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
         AND u.email IS NOT NULL
         AND u.email != ''`
    );

    console.log(`[Penalty Scheduler] Found ${transactions.length} transactions due tomorrow`);

    for (const transaction of transactions) {
      try {
        // Send email notification
        await sendPenaltyDueReminder(
          transaction.email,
          transaction.user_name,
          transaction
        );

        // Send WebSocket notification to user frontend
        if (wsServer && wsServer.io) {
          wsServer.io.emit('user_notification', {
            user_id: transaction.user_id,
            type: 'due_tomorrow',
            title: 'Item Due Tomorrow',
            message: `Your borrowed item "${transaction.book_title || transaction.research_title}" (Ref: ${transaction.reference_number}) is due tomorrow. Please return it on time to avoid penalties.`,
            reference_number: transaction.reference_number,
            due_date: transaction.due_date,
            timestamp: new Date().toISOString(),
            priority: 'medium'
          });
        }

        console.log(`[Penalty Scheduler] Due reminder sent to ${transaction.user_name} (${transaction.email})`);
      } catch (error) {
        console.error(`[Penalty Scheduler] Error sending due reminder for transaction ${transaction.transaction_id}:`, error);
      }
    }

    return transactions.length;
  } catch (error) {
    console.error('[Penalty Scheduler] Error checking due tomorrow reminders:', error);
    throw error;
  }
};

/**
 * Check for overdue items and send daily notifications
 */
const checkOverdueNotifications = async () => {
  try {
    console.log('[Penalty Scheduler] Checking for overdue items...');
    
    // Get all overdue transactions with their penalties
    const [penalties] = await pool.execute(
      `SELECT 
        p.penalty_id,
        p.transaction_id,
        p.user_id,
        p.fine,
        p.status as penalty_status,
        t.reference_number,
        t.due_date,
        DATEDIFF(CURDATE(), STR_TO_DATE(t.due_date, '%Y-%m-%d')) as days_overdue,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        u.email,
        b.book_title,
        rp.research_title
       FROM penalties p
       LEFT JOIN transactions t ON p.transaction_id = t.transaction_id
       LEFT JOIN users u ON p.user_id = u.user_id
       LEFT JOIN books b ON t.book_id = b.book_id
       LEFT JOIN research_papers rp ON t.research_paper_id = rp.research_paper_id
       WHERE (p.status != 'Paid' AND p.status != 'Waived' OR p.status IS NULL)
         AND t.status = 'Borrowed'
         AND DATEDIFF(CURDATE(), STR_TO_DATE(t.due_date, '%Y-%m-%d')) > 0
         AND u.email IS NOT NULL
         AND u.email != ''
         AND p.penalty_id IN (
           SELECT MAX(p2.penalty_id) 
           FROM penalties p2 
           WHERE (p2.status != 'Paid' AND p2.status != 'Waived' OR p2.status IS NULL)
           GROUP BY p2.transaction_id, p2.user_id
         )`
    );

    console.log(`[Penalty Scheduler] Found ${penalties.length} overdue items`);

    for (const penalty of penalties) {
      try {
        // Send email notification
        await sendOverduePenaltyNotification(
          penalty.email,
          penalty.user_name,
          penalty
        );

        // Send WebSocket notification to user frontend
        if (wsServer && wsServer.io) {
          wsServer.io.emit('user_notification', {
            user_id: penalty.user_id,
            type: 'overdue_penalty',
            title: 'Overdue Item - Action Required',
            message: `Your item "${penalty.book_title || penalty.research_title}" is ${penalty.days_overdue} day(s) overdue. Current fine: ₱${parseFloat(penalty.fine).toFixed(2)}. Please return it immediately.`,
            reference_number: penalty.reference_number,
            fine_amount: penalty.fine,
            days_overdue: penalty.days_overdue,
            timestamp: new Date().toISOString(),
            priority: 'high'
          });
        }

        console.log(`[Penalty Scheduler] Overdue notification sent to ${penalty.user_name} (${penalty.email})`);
      } catch (error) {
        console.error(`[Penalty Scheduler] Error sending overdue notification for penalty ${penalty.penalty_id}:`, error);
      }
    }

    return penalties.length;
  } catch (error) {
    console.error('[Penalty Scheduler] Error checking overdue notifications:', error);
    throw error;
  }
};

/**
 * Run daily penalty checks
 */
const runDailyPenaltyChecks = async () => {
  try {
    console.log('\n=== [Penalty Scheduler] Starting daily penalty checks ===');
    const startTime = new Date();
    
    // Check for items due tomorrow
    const dueTomorrowCount = await checkDueTomorrowReminders();
    
    // Check for overdue items
    const overdueCount = await checkOverdueNotifications();
    
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;
    
    console.log(`=== [Penalty Scheduler] Daily checks completed in ${duration}s ===`);
    console.log(`   - Due tomorrow reminders sent: ${dueTomorrowCount}`);
    console.log(`   - Overdue notifications sent: ${overdueCount}\n`);
    
    return {
      dueTomorrowCount,
      overdueCount,
      duration
    };
  } catch (error) {
    console.error('[Penalty Scheduler] Error running daily penalty checks:', error);
    throw error;
  }
};

/**
 * Start the penalty scheduler
 * Runs checks every day at 9:00 AM
 */
const startPenaltyScheduler = () => {
  console.log('✅ Penalty Scheduler initialized');
  
  // Run immediately on startup for testing
  setTimeout(() => {
    console.log('[Penalty Scheduler] Running initial check...');
    runDailyPenaltyChecks().catch(err => {
      console.error('[Penalty Scheduler] Initial check failed:', err);
    });
  }, 5000); // Wait 5 seconds after server start
  
  // Calculate time until next 9:00 AM
  const now = new Date();
  const next9AM = new Date();
  next9AM.setHours(9, 0, 0, 0);
  
  // If it's already past 9 AM today, schedule for tomorrow
  if (now >= next9AM) {
    next9AM.setDate(next9AM.getDate() + 1);
  }
  
  const timeUntil9AM = next9AM - now;
  
  console.log(`[Penalty Scheduler] Next scheduled run: ${next9AM.toLocaleString()}`);
  
  // Schedule first run at 9:00 AM
  setTimeout(() => {
    runDailyPenaltyChecks().catch(err => {
      console.error('[Penalty Scheduler] Scheduled check failed:', err);
    });
    
    // Then run every 24 hours
    setInterval(() => {
      runDailyPenaltyChecks().catch(err => {
        console.error('[Penalty Scheduler] Daily check failed:', err);
      });
    }, 24 * 60 * 60 * 1000); // 24 hours
  }, timeUntil9AM);
};

module.exports = {
  setWebSocketServer,
  checkDueTomorrowReminders,
  checkOverdueNotifications,
  runDailyPenaltyChecks,
  startPenaltyScheduler
};
