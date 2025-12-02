const { pool } = require('./config/database');

async function testWaivedPenalties() {
  try {
    // Check waived penalties
    const [waived] = await pool.execute(
      `SELECT * FROM penalties WHERE status = 'Waived' ORDER BY updated_at DESC LIMIT 5`
    );
    console.log('\n=== Waived Penalties in penalties table ===');
    console.log(JSON.stringify(waived, null, 2));

    // Check waived transactions query
    const [transactions] = await pool.execute(
      `SELECT 
        t.transaction_id,
        t.reference_number,
        t.status as transaction_status,
        p.penalty_id,
        p.status as penalty_status,
        p.fine as waived_fine,
        p.waive_reason,
        p.waived_by,
        p.updated_at as waived_date
      FROM penalties p
      INNER JOIN transactions t ON p.transaction_id = t.transaction_id AND p.user_id = t.user_id
      WHERE p.status = 'Waived'
      ORDER BY p.updated_at DESC`
    );
    console.log('\n=== Waived Transactions (joined with transactions table) ===');
    console.log(JSON.stringify(transactions, null, 2));

    console.log('\n=== Summary ===');
    console.log(`Total waived penalties: ${waived.length}`);
    console.log(`Total waived transactions: ${transactions.length}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit();
  }
}

testWaivedPenalties();
