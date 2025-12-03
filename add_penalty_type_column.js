const { pool } = require('./config/database');

async function addPenaltyTypeColumn() {
  try {
    console.log('Checking penalties table for penalty_type column...');
    
    // Check if column already exists
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'penalties' 
        AND COLUMN_NAME = 'penalty_type'
    `);
    
    if (columns.length === 0) {
      console.log('Adding penalty_type column...');
      
      await pool.execute(`
        ALTER TABLE penalties 
        ADD COLUMN penalty_type ENUM('overdue', 'lost_damaged') DEFAULT 'overdue' AFTER fine
      `);
      
      console.log('✅ penalty_type column added successfully!');
      
      // Update existing penalties with lost/damaged descriptions to have the correct type
      console.log('Updating existing lost/damaged penalties...');
      const [updateResult] = await pool.execute(`
        UPDATE penalties 
        SET penalty_type = 'lost_damaged' 
        WHERE waive_reason LIKE 'Lost/Damaged%'
      `);
      console.log(`✅ Updated ${updateResult.affectedRows} existing lost/damaged penalties`);
      
    } else {
      console.log('✅ penalty_type column already exists!');
    }
    
    // Verify final structure
    const [finalColumns] = await pool.execute(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'penalties'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('\nFinal penalties table structure:');
    finalColumns.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} (${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}) DEFAULT: ${col.COLUMN_DEFAULT || 'NONE'}`);
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

addPenaltyTypeColumn();
