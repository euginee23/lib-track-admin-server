const { pool } = require('./config/database');

async function addBookPriceColumn() {
  try {
    console.log('Checking penalties table for book_price column...');
    
    // Check if column already exists
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'penalties' 
        AND COLUMN_NAME = 'book_price'
    `);
    
    if (columns.length === 0) {
      console.log('Adding book_price column...');
      
      await pool.execute(`
        ALTER TABLE penalties 
        ADD COLUMN book_price DECIMAL(10, 2) DEFAULT 0.00 AFTER fine
      `);
      
      console.log('✅ book_price column added successfully!');
      
      // Update existing lost/damaged penalties with book prices from the description
      console.log('Checking for existing lost/damaged penalties to update...');
      const [lostPenalties] = await pool.execute(`
        SELECT p.penalty_id, p.waive_reason, b.book_price, p.fine
        FROM penalties p
        INNER JOIN transactions t ON p.transaction_id = t.transaction_id
        LEFT JOIN books b ON t.book_id = b.book_id
        WHERE p.penalty_type = 'lost_damaged' AND b.book_price IS NOT NULL
      `);
      
      if (lostPenalties.length > 0) {
        console.log(`Found ${lostPenalties.length} lost/damaged penalties to update`);
        for (const penalty of lostPenalties) {
          await pool.execute(`
            UPDATE penalties 
            SET book_price = ? 
            WHERE penalty_id = ?
          `, [penalty.book_price || 0, penalty.penalty_id]);
        }
        console.log(`✅ Updated ${lostPenalties.length} lost/damaged penalties with book prices`);
      } else {
        console.log('No existing lost/damaged penalties found to update');
      }
      
    } else {
      console.log('✅ book_price column already exists!');
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

addBookPriceColumn();
