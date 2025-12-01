const { pool } = require('./config/database');

async function addMissingColumns() {
  try {
    console.log('🔄 Adding missing columns to users table...');
    
    // Add profile_image column
    try {
      await pool.execute(
        `ALTER TABLE users ADD COLUMN profile_image VARCHAR(500) NULL`
      );
      console.log('✅ Added profile_image column');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('⚠️  profile_image column already exists');
      } else {
        throw error;
      }
    }
    
    // Add updated_at column
    try {
      await pool.execute(
        `ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
      );
      console.log('✅ Added updated_at column');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('⚠️  updated_at column already exists');
      } else {
        throw error;
      }
    }
    
    console.log('🎉 Missing columns added successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('💥 Error adding columns:', error);
    process.exit(1);
  }
}

addMissingColumns();