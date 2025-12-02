const { pool } = require('./config/database');

async function addWaiveColumns() {
  try {
    console.log('Checking penalties table structure...');
    
    // Check if columns already exist
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'penalties' 
        AND COLUMN_NAME IN ('waive_reason', 'waived_by')
    `);
    
    console.log('Existing waive columns:', columns.map(c => c.COLUMN_NAME));
    
    if (columns.length === 0) {
      console.log('Adding waive_reason and waived_by columns...');
      
      await pool.execute(`
        ALTER TABLE penalties 
        ADD COLUMN waive_reason TEXT NULL AFTER status,
        ADD COLUMN waived_by VARCHAR(200) NULL AFTER waive_reason
      `);
      
      console.log('✅ Waive columns added successfully!');
    } else if (columns.length === 1) {
      const existingColumn = columns[0].COLUMN_NAME;
      const missingColumn = existingColumn === 'waive_reason' ? 'waived_by' : 'waive_reason';
      
      console.log(`Adding missing column: ${missingColumn}...`);
      
      if (missingColumn === 'waived_by') {
        await pool.execute(`
          ALTER TABLE penalties 
          ADD COLUMN waived_by VARCHAR(200) NULL AFTER waive_reason
        `);
      } else {
        await pool.execute(`
          ALTER TABLE penalties 
          ADD COLUMN waive_reason TEXT NULL AFTER status
        `);
      }
      
      console.log(`✅ Column ${missingColumn} added successfully!`);
    } else {
      console.log('✅ Both waive columns already exist!');
    }
    
    // Verify final structure
    const [finalColumns] = await pool.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'penalties'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('\nFinal penalties table structure:');
    finalColumns.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME}: ${col.DATA_TYPE} (${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'})`);
    });
    
    await pool.end();
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error during migration:', error);
    await pool.end();
    process.exit(1);
  }
}

addWaiveColumns();
