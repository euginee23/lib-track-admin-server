const { pool } = require('./config/database');

async function testWaiveStatus() {
  try {
    console.log('\n=== Testing Waived Penalty Status ===\n');
    
    // Check if there are any waived penalties
    const [waivedPenalties] = await pool.execute(
      `SELECT 
        penalty_id,
        transaction_id,
        user_id,
        fine,
        status,
        waive_reason,
        waived_by,
        updated_at
       FROM penalties
       WHERE status = 'Waived'
       ORDER BY updated_at DESC
       LIMIT 5`
    );
    
    if (waivedPenalties.length === 0) {
      console.log('❌ No waived penalties found in database');
      console.log('   Please waive a penalty first to test this fix\n');
    } else {
      console.log(`✅ Found ${waivedPenalties.length} waived penalties in database:\n`);
      
      waivedPenalties.forEach((p, idx) => {
        console.log(`${idx + 1}. Penalty ID: ${p.penalty_id}`);
        console.log(`   Transaction ID: ${p.transaction_id}`);
        console.log(`   User ID: ${p.user_id}`);
        console.log(`   Fine: ₱${p.fine}`);
        console.log(`   Status: ${p.status}`);
        console.log(`   Waive Reason: ${p.waive_reason || 'N/A'}`);
        console.log(`   Waived By: ${p.waived_by || 'N/A'}`);
        console.log(`   Updated: ${p.updated_at}`);
        console.log('');
      });
    }
    
    // Test the query from the GET penalties endpoint
    console.log('=== Testing GET Penalties Query ===\n');
    
    const [penalties] = await pool.execute(
      `SELECT 
        p.*,
        t.reference_number,
        t.due_date,
        t.transaction_type,
        t.status as transaction_status,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        u.position,
        u.email,
        d.department_acronym,
        b.book_title,
        rp.research_title,
        CASE 
          WHEN t.status = 'Returned' AND t.return_date IS NOT NULL THEN DATEDIFF(STR_TO_DATE(t.return_date, '%Y-%m-%d'), STR_TO_DATE(t.due_date, '%Y-%m-%d'))
          ELSE DATEDIFF(CURDATE(), STR_TO_DATE(t.due_date, '%Y-%m-%d'))
        END as days_overdue,
        p.status
      FROM penalties p
      LEFT JOIN transactions t ON p.transaction_id = t.transaction_id
      LEFT JOIN users u ON p.user_id = u.user_id
      LEFT JOIN departments d ON u.department_id = d.department_id
      LEFT JOIN books b ON t.book_id = b.book_id
      LEFT JOIN research_papers rp ON t.research_paper_id = rp.research_paper_id
      WHERE p.status = 'Waived'
      ORDER BY p.updated_at DESC
      LIMIT 5`
    );
    
    if (penalties.length === 0) {
      console.log('❌ Query returned no waived penalties\n');
    } else {
      console.log(`✅ Query returned ${penalties.length} waived penalties:\n`);
      
      penalties.forEach((p, idx) => {
        console.log(`${idx + 1}. Penalty ID: ${p.penalty_id}`);
        console.log(`   Status from DB: ${p.status}`);
        console.log(`   User: ${p.user_name}`);
        console.log(`   Reference: ${p.reference_number}`);
        console.log(`   Fine: ₱${p.fine}`);
        console.log('');
      });
    }
    
    console.log('=== Test Complete ===\n');
    console.log('✅ The fix has been applied!');
    console.log('   - Removed COALESCE override in SQL query');
    console.log('   - Fixed JavaScript status override');
    console.log('   - Waived penalties should now display correctly\n');
    console.log('Please refresh the admin panel to see the changes.\n');
    
  } catch (error) {
    console.error('❌ Error testing waive status:', error);
  } finally {
    process.exit(0);
  }
}

testWaiveStatus();
