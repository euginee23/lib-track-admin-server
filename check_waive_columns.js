const { pool } = require('./config/database');

async function checkWaiveColumns() {
  try {
    console.log('\n=== Checking Penalties Table Structure ===\n');
    
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'penalties'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('Columns in penalties table:\n');
    columns.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE}) ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'} ${col.COLUMN_DEFAULT ? `DEFAULT ${col.COLUMN_DEFAULT}` : ''}`);
    });
    
    const hasWaiveReason = columns.some(c => c.COLUMN_NAME === 'waive_reason');
    const hasWaivedBy = columns.some(c => c.COLUMN_NAME === 'waived_by');
    
    console.log('\n=== Column Check Results ===\n');
    console.log(`waive_reason column: ${hasWaiveReason ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`waived_by column: ${hasWaivedBy ? '✅ EXISTS' : '❌ MISSING'}`);
    
    if (!hasWaiveReason || !hasWaivedBy) {
      console.log('\n❌ Waive columns are missing! Running add_waive_columns script...\n');
      require('./add_waive_columns');
    } else {
      console.log('\n✅ All waive columns exist!\n');
    }
    
    // Check for any penalties
    const [penaltyCount] = await pool.execute(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) as paid,
        SUM(CASE WHEN status = 'Waived' THEN 1 ELSE 0 END) as waived,
        SUM(CASE WHEN status IS NULL OR (status != 'Paid' AND status != 'Waived') THEN 1 ELSE 0 END) as pending
      FROM penalties
    `);
    
    const counts = penaltyCount[0];
    console.log('=== Penalty Counts ===\n');
    console.log(`Total penalties: ${counts.total}`);
    console.log(`Paid: ${counts.paid}`);
    console.log(`Waived: ${counts.waived}`);
    console.log(`Pending/Overdue: ${counts.pending}\n`);
    
    if (counts.total === 0) {
      console.log('⚠️  No penalties in database. Create some overdue transactions first.\n');
    }
    
  } catch (error) {
    console.error('❌ Error checking columns:', error);
  } finally {
    process.exit(0);
  }
}

checkWaiveColumns();
