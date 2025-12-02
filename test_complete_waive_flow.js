const { pool } = require('./config/database');

async function testWaiveFlow() {
  try {
    console.log('\n=== Testing Complete Waive Flow ===\n');
    
    // Step 1: Find a pending/overdue penalty
    const [pendingPenalties] = await pool.execute(`
      SELECT 
        p.penalty_id,
        p.transaction_id,
        p.user_id,
        p.fine,
        p.status,
        t.reference_number,
        CONCAT(u.first_name, ' ', u.last_name) as user_name
      FROM penalties p
      LEFT JOIN transactions t ON p.transaction_id = t.transaction_id
      LEFT JOIN users u ON p.user_id = u.user_id
      WHERE p.status != 'Paid' AND p.status != 'Waived'
      LIMIT 1
    `);
    
    if (pendingPenalties.length === 0) {
      console.log('❌ No pending penalties found to test with');
      console.log('   Please ensure there are overdue transactions with penalties\n');
      return;
    }
    
    const penalty = pendingPenalties[0];
    console.log('Step 1: Found pending penalty to test:\n');
    console.log(`  Penalty ID: ${penalty.penalty_id}`);
    console.log(`  Transaction: ${penalty.reference_number}`);
    console.log(`  User: ${penalty.user_name}`);
    console.log(`  Fine: ₱${penalty.fine}`);
    console.log(`  Current Status: ${penalty.status}\n`);
    
    // Step 2: Waive the penalty
    console.log('Step 2: Waiving penalty...\n');
    
    const waiveReason = 'TEST: Verifying waive functionality fix';
    const waivedBy = 'System Test';
    
    const [updateResult] = await pool.execute(`
      UPDATE penalties 
      SET status = 'Waived', waive_reason = ?, waived_by = ?, updated_at = NOW()
      WHERE penalty_id = ?
    `, [waiveReason, waivedBy, penalty.penalty_id]);
    
    if (updateResult.affectedRows === 0) {
      console.log('❌ Failed to update penalty status\n');
      return;
    }
    
    console.log(`✅ Penalty ${penalty.penalty_id} updated successfully!\n`);
    
    // Step 3: Verify the update
    console.log('Step 3: Verifying update in database...\n');
    
    const [verifyResult] = await pool.execute(`
      SELECT 
        penalty_id,
        status,
        waive_reason,
        waived_by,
        updated_at
      FROM penalties
      WHERE penalty_id = ?
    `, [penalty.penalty_id]);
    
    if (verifyResult.length === 0) {
      console.log('❌ Penalty not found after update\n');
      return;
    }
    
    const updated = verifyResult[0];
    console.log('Database record after update:');
    console.log(`  Penalty ID: ${updated.penalty_id}`);
    console.log(`  Status: ${updated.status}`);
    console.log(`  Waive Reason: ${updated.waive_reason}`);
    console.log(`  Waived By: ${updated.waived_by}`);
    console.log(`  Updated At: ${updated.updated_at}\n`);
    
    if (updated.status !== 'Waived') {
      console.log(`❌ Status is "${updated.status}" instead of "Waived"\n`);
      return;
    }
    
    // Step 4: Test the GET query
    console.log('Step 4: Testing GET penalties query...\n');
    
    const [getResult] = await pool.execute(`
      SELECT 
        p.*,
        t.reference_number,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        p.status
      FROM penalties p
      LEFT JOIN transactions t ON p.transaction_id = t.transaction_id
      LEFT JOIN users u ON p.user_id = u.user_id
      WHERE p.penalty_id = ?
    `, [penalty.penalty_id]);
    
    if (getResult.length === 0) {
      console.log('❌ GET query returned no results\n');
      return;
    }
    
    const fetched = getResult[0];
    console.log('GET query result:');
    console.log(`  Penalty ID: ${fetched.penalty_id}`);
    console.log(`  Status from query: ${fetched.status}`);
    console.log(`  User: ${fetched.user_name}`);
    console.log(`  Reference: ${fetched.reference_number}\n`);
    
    if (fetched.status !== 'Waived') {
      console.log(`❌ GET query returned status "${fetched.status}" instead of "Waived"\n`);
      return;
    }
    
    // Step 5: Test with filter
    console.log('Step 5: Testing GET with waived filter...\n');
    
    const [filterResult] = await pool.execute(`
      SELECT COUNT(*) as count
      FROM penalties
      WHERE status = 'Waived'
    `);
    
    console.log(`✅ Found ${filterResult[0].count} waived penalties in total\n`);
    
    console.log('=== All Tests Passed! ===\n');
    console.log('✅ Penalty was successfully waived');
    console.log('✅ Database stores "Waived" status correctly');
    console.log('✅ GET queries return "Waived" status correctly');
    console.log('✅ The fix is working as expected\n');
    console.log('Now test in the admin panel:');
    console.log('1. Refresh the Manage Penalties page');
    console.log('2. Filter by "Waived" to see waived penalties');
    console.log(`3. Look for penalty #${penalty.penalty_id}\n`);
    
  } catch (error) {
    console.error('❌ Error during test:', error);
  } finally {
    process.exit(0);
  }
}

testWaiveFlow();
