const { pool } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runSchemaUpdates() {
  try {
    console.log('🔄 Starting database schema updates...');
    
    // Read the SQL schema file
    const sqlPath = path.join(__dirname, 'sql', 'schema_updates.sql');
    
    if (!fs.existsSync(sqlPath)) {
      console.log('❌ Schema update file not found:', sqlPath);
      return;
    }
    
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split SQL statements by semicolon and filter out empty statements
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📋 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      try {
        console.log(`   ${i + 1}/${statements.length}: Executing...`);
        await pool.execute(statement);
        console.log(`   ✅ Statement ${i + 1} executed successfully`);
      } catch (error) {
        // Some errors are expected (like "column already exists" or "duplicate key")
        if (error.code === 'ER_DUP_FIELDNAME' || 
            error.code === 'ER_DUP_KEYNAME' ||
            error.code === 'ER_CANT_DROP_FIELD_OR_KEY' ||
            error.code === 'ER_DUP_ENTRY' ||
            error.code === 'ER_FOREIGN_KEY_ALREADY_EXISTS' ||
            error.message.includes('already exists') ||
            error.message.includes('Duplicate key name') ||
            error.message.includes('Duplicate column name')) {
          console.log(`   ⚠️  Statement ${i + 1} skipped (already exists):`, error.code);
        } else {
          console.log(`   ❌ Error in statement ${i + 1}:`, error.message);
          throw error;
        }
      }
    }
    
    // Verify critical tables and columns exist
    console.log('\n🔍 Verifying database structure...');
    
    // Check if users table has semester fields
    const [userColumns] = await pool.execute(
      `DESCRIBE users`
    );
    
    const userColumnNames = userColumns.map(col => col.Field);
    const requiredColumns = ['semester_id', 'semester_verified', 'semester_verified_at', 'profile_image', 'updated_at'];
    
    console.log('\n📊 Users table columns verification:');
    requiredColumns.forEach(col => {
      const exists = userColumnNames.includes(col);
      console.log(`   ${exists ? '✅' : '❌'} ${col}: ${exists ? 'EXISTS' : 'MISSING'}`);
    });
    
    // Check if semesters table exists
    try {
      const [semesterCount] = await pool.execute(
        `SELECT COUNT(*) as count FROM semesters`
      );
      console.log(`\n✅ Semesters table exists with ${semesterCount[0].count} records`);
    } catch (error) {
      console.log('\n❌ Semesters table missing or inaccessible:', error.message);
    }
    
    // Check if departments table exists
    try {
      const [departmentCount] = await pool.execute(
        `SELECT COUNT(*) as count FROM departments`
      );
      console.log(`✅ Departments table exists with ${departmentCount[0].count} records`);
    } catch (error) {
      console.log('❌ Departments table missing or inaccessible:', error.message);
    }
    
    // Check if system_settings table exists
    try {
      const [settingsCount] = await pool.execute(
        `SELECT COUNT(*) as count FROM system_settings`
      );
      console.log(`✅ System_settings table exists with ${settingsCount[0].count} records`);
    } catch (error) {
      console.log('❌ System_settings table missing or inaccessible:', error.message);
    }
    
    console.log('\n🎉 Database schema update completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Restart your server to use the new schema');
    console.log('   2. Create at least one semester in the admin panel');
    console.log('   3. Create departments if they don\'t exist');
    console.log('   4. Test user registration and profile updates');
    
  } catch (error) {
    console.error('\n💥 Fatal error during schema update:', error);
    throw error;
  } finally {
    // Don't close pool here as it might be used by the main application
  }
}

// Run if called directly
if (require.main === module) {
  runSchemaUpdates()
    .then(() => {
      console.log('\n👋 Schema update completed. You can now start your server.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Schema update failed:', error);
      process.exit(1);
    });
}

module.exports = { runSchemaUpdates };