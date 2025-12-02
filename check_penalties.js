const { pool } = require('./config/database');

async function checkPenalties() {
  try {
    console.log('Checking all penalties in database...\n');
    
    const [penalties] = await pool.execute(`
      SELECT 
        p.penalty_id,
        p.transaction_id,
        p.user_id,
        p.fine,
        p.status,
        p.waive_reason,
        p.waived_by,
        p.updated_at,
        t.reference_number,
        CONCAT(u.first_name, ' ', u.last_name) as user_name
      FROM penalties p
      LEFT JOIN transactions t ON p.transaction_id = p.transaction_id
      LEFT JOIN users u ON p.user_id = u.user_id
      ORDER BY p.updated_at DESC
      LIMIT 20
    `);
    
    console.log(`Found ${penalties.length} penalties:\n`);
    
    const statusCounts = {};
    penalties.forEach(p => {
      const status = p.status || 'NULL';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      
      console.log(`ID: ${p.penalty_id} | Status: ${status || 'NULL'} | Fine: ₱${p.fine} | User: ${p.user_name || 'Unknown'}`);
      if (p.waive_reason) {
        console.log(`  └─ Waived: ${p.waive_reason} (by ${p.waived_by})`);
      }
    });
    
    console.log('\n=== Status Summary ===');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`${status}: ${count}`);
    });
    
    await pool.end();
    process.exit(0);
    
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

checkPenalties();
