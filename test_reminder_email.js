const { pool } = require('./config/database');
const { sendPenaltyDueReminder } = require('./smtp/penaltyNotification');

async function testReminderEmail() {
  try {
    console.log('\n=== Testing Reminder Email Functionality ===\n');

    // Find a transaction to test with
    const [transactions] = await pool.execute(`
      SELECT 
        t.*,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        u.email,
        b.book_title,
        rp.research_title
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.user_id
      LEFT JOIN books b ON t.book_id = b.book_id
      LEFT JOIN research_papers rp ON t.research_paper_id = rp.research_paper_id
      WHERE t.transaction_type = 'borrow'
        AND t.status != 'Returned'
        AND u.email IS NOT NULL
      LIMIT 1
    `);

    if (transactions.length === 0) {
      console.log('❌ No active transactions found to test with');
      console.log('   Please ensure there are active borrow transactions with user emails\n');
      return;
    }

    const transaction = transactions[0];
    
    console.log('Found transaction to test:');
    console.log(`  Transaction ID: ${transaction.transaction_id}`);
    console.log(`  Reference: ${transaction.reference_number}`);
    console.log(`  User: ${transaction.user_name}`);
    console.log(`  Email: ${transaction.email}`);
    console.log(`  Item: ${transaction.book_title || transaction.research_title}`);
    console.log(`  Due Date: ${transaction.due_date}\n`);

    console.log('Sending test reminder email...\n');

    try {
      await sendPenaltyDueReminder(
        transaction.email,
        transaction.user_name,
        transaction
      );

      console.log('✅ Reminder email sent successfully!\n');
      console.log('=== Test Complete ===\n');
      console.log('The reminder email has been sent to:', transaction.email);
      console.log('\nPlease check:');
      console.log('1. The email inbox for', transaction.email);
      console.log('2. Server logs for any SMTP errors');
      console.log('3. The admin panel "Send Reminder" button should now send emails\n');

    } catch (emailError) {
      console.error('❌ Failed to send reminder email:', emailError.message);
      console.error('\nPossible issues:');
      console.error('- SMTP configuration not set up correctly');
      console.error('- Email credentials invalid');
      console.error('- Network connectivity issues');
      console.error('\nCheck your .env file for SMTP settings\n');
    }

  } catch (error) {
    console.error('❌ Error during test:', error);
  } finally {
    process.exit(0);
  }
}

testReminderEmail();
