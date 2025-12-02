const { pool } = require('./config/database');

async function checkPenaltyConditions() {
  try {
    console.log('Checking penalty button enable conditions...\n');
    
    const [penalties] = await pool.execute(`
      SELECT 
        p.penalty_id,
        p.transaction_id,
        p.user_id,
        p.fine,
        p.status,
        t.reference_number,
        t.due_date,
        t.return_date,
        t.status as transaction_status,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        CASE 
          WHEN NULLIF(TRIM(t.return_date), '') IS NOT NULL AND NULLIF(TRIM(t.due_date), '') IS NOT NULL
          THEN DATEDIFF(
            STR_TO_DATE(t.return_date, '%Y-%m-%d'), 
            STR_TO_DATE(t.due_date, '%Y-%m-%d')
          )
          WHEN NULLIF(TRIM(t.due_date), '') IS NOT NULL
          THEN DATEDIFF(CURDATE(), STR_TO_DATE(t.due_date, '%Y-%m-%d'))
          ELSE 0
        END as days_overdue
      FROM penalties p
      LEFT JOIN transactions t ON p.transaction_id = t.transaction_id
      LEFT JOIN users u ON p.user_id = u.user_id
      WHERE p.status != 'Paid' AND p.status != 'Waived'
      ORDER BY p.updated_at DESC
      LIMIT 10
    `);
    
    console.log(`Found ${penalties.length} unpaid/unwaived penalties:\n`);
    
    penalties.forEach(p => {
      console.log(`Penalty ID: ${p.penalty_id}`);
      console.log(`  Status: ${p.status || 'NULL'}`);
      console.log(`  Fine: ₱${p.fine}`);
      console.log(`  Days Overdue: ${p.days_overdue}`);
      console.log(`  Transaction Status: ${p.transaction_status}`);
      console.log(`  Due Date: ${p.due_date}`);
      console.log(`  Return Date: ${p.return_date || 'Not returned'}`);
      
      // Check button enable conditions
      const buttonEnabled = !(
        p.status === 'Paid' || 
        p.status === 'Waived' || 
        (Number(p.days_overdue) || 0) <= 0
      );
      
      console.log(`  ❯ Waive Button Enabled: ${buttonEnabled ? '✅ YES' : '❌ NO'}`);
      
      if (!buttonEnabled && p.status !== 'Paid' && p.status !== 'Waived') {
        console.log(`    └─ Reason: days_overdue (${p.days_overdue}) <= 0`);
      }
      console.log('');
    });
    
    await pool.end();
    process.exit(0);
    
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

checkPenaltyConditions();
