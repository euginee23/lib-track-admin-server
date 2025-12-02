const { pool } = require('./config/database');

async function cleanupDuplicateWaivedPenalties() {
  try {
    console.log('\n=== Cleaning Up Duplicate Penalties ===\n');

    // Find transactions that have multiple penalties (including waived ones)
    const [duplicates] = await pool.execute(`
      SELECT 
        transaction_id,
        user_id,
        COUNT(*) as penalty_count,
        GROUP_CONCAT(penalty_id ORDER BY penalty_id) as penalty_ids,
        GROUP_CONCAT(status ORDER BY penalty_id) as statuses,
        GROUP_CONCAT(fine ORDER BY penalty_id) as fines
      FROM penalties
      GROUP BY transaction_id, user_id
      HAVING penalty_count > 1
    `);

    if (duplicates.length === 0) {
      console.log('✅ No duplicate penalties found\n');
      return;
    }

    console.log(`Found ${duplicates.length} transactions with duplicate penalties:\n`);

    for (const dup of duplicates) {
      const penaltyIds = dup.penalty_ids.split(',');
      const statuses = dup.statuses.split(',');
      const fines = dup.fines.split(',');

      console.log(`Transaction ${dup.transaction_id}:`);
      penaltyIds.forEach((id, idx) => {
        console.log(`  - Penalty ${id}: ${statuses[idx] || 'NULL'} (₱${fines[idx]})`);
      });

      // Keep the waived/paid penalty if it exists, otherwise keep the latest one
      let keepPenaltyId = null;
      
      // First, check for waived penalty
      const waivedIndex = statuses.findIndex(s => s === 'Waived');
      if (waivedIndex !== -1) {
        keepPenaltyId = penaltyIds[waivedIndex];
        console.log(`  → Keeping WAIVED penalty ${keepPenaltyId}`);
      } else {
        // Check for paid penalty
        const paidIndex = statuses.findIndex(s => s === 'Paid');
        if (paidIndex !== -1) {
          keepPenaltyId = penaltyIds[paidIndex];
          console.log(`  → Keeping PAID penalty ${keepPenaltyId}`);
        } else {
          // Keep the latest one
          keepPenaltyId = penaltyIds[penaltyIds.length - 1];
          console.log(`  → Keeping LATEST penalty ${keepPenaltyId}`);
        }
      }

      // Delete other penalties
      const deleteIds = penaltyIds.filter(id => id !== keepPenaltyId);
      if (deleteIds.length > 0) {
        await pool.execute(
          `DELETE FROM penalties WHERE penalty_id IN (${deleteIds.join(',')})`,
        );
        console.log(`  → Deleted ${deleteIds.length} duplicate penalty(ies): ${deleteIds.join(', ')}`);
      }
      console.log('');
    }

    console.log('=== Cleanup Complete ===\n');
    console.log('✅ All duplicate penalties have been cleaned up');
    console.log('✅ Waived penalties are preserved\n');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    process.exit(0);
  }
}

cleanupDuplicateWaivedPenalties();
