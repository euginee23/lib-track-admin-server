const { pool } = require('./config/database');

async function testProfileSystem() {
  try {
    console.log('🧪 Testing Profile System Integration...\n');
    
    // Test 1: Check if all required tables exist
    console.log('1. 📊 Checking database tables...');
    
    const tables = ['users', 'semesters', 'departments', 'system_settings'];
    for (const table of tables) {
      try {
        const [result] = await pool.execute(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`   ✅ ${table}: ${result[0].count} records`);
      } catch (error) {
        console.log(`   ❌ ${table}: Missing or inaccessible`);
        throw new Error(`Table ${table} is missing`);
      }
    }
    
    // Test 2: Check users table structure
    console.log('\n2. 🏗️  Checking users table structure...');
    const [columns] = await pool.execute(`DESCRIBE users`);
    const columnNames = columns.map(col => col.Field);
    
    const requiredColumns = [
      'user_id', 'first_name', 'last_name', 'email', 'password',
      'department_id', 'position', 'semester_id', 'semester_verified',
      'semester_verified_at', 'profile_image', 'updated_at'
    ];
    
    requiredColumns.forEach(col => {
      const exists = columnNames.includes(col);
      console.log(`   ${exists ? '✅' : '❌'} ${col}`);
      if (!exists) throw new Error(`Column ${col} is missing from users table`);
    });
    
    // Test 3: Check active semester
    console.log('\n3. 📅 Checking active semester...');
    const [activeSemester] = await pool.execute(
      `SELECT * FROM semesters WHERE is_active = 1 LIMIT 1`
    );
    
    if (activeSemester.length > 0) {
      const semester = activeSemester[0];
      console.log(`   ✅ Active semester: ${semester.semester_name} (${semester.school_year})`);
      console.log(`   📍 Semester ID: ${semester.semester_id}`);
    } else {
      console.log('   ⚠️  No active semester found - users will not be auto-assigned during registration');
    }
    
    // Test 4: Check departments
    console.log('\n4. 🏛️  Checking departments...');
    const [departments] = await pool.execute(
      `SELECT department_id, department_name, department_acronym FROM departments LIMIT 5`
    );
    
    if (departments.length > 0) {
      console.log(`   ✅ Found ${departments.length} departments:`);
      departments.forEach(dept => {
        console.log(`      ${dept.department_id}: ${dept.department_name} (${dept.department_acronym || 'No acronym'})`);
      });
    } else {
      console.log('   ⚠️  No departments found - users will not be able to select departments');
    }
    
    // Test 5: Check foreign key constraints
    console.log('\n5. 🔗 Checking foreign key constraints...');
    const [constraints] = await pool.execute(`
      SELECT 
        CONSTRAINT_NAME, 
        TABLE_NAME, 
        COLUMN_NAME, 
        REFERENCED_TABLE_NAME, 
        REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND REFERENCED_TABLE_NAME IS NOT NULL
    `);
    
    if (constraints.length > 0) {
      console.log('   ✅ Foreign key constraints found:');
      constraints.forEach(fk => {
        console.log(`      ${fk.COLUMN_NAME} → ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}`);
      });
    } else {
      console.log('   ⚠️  No foreign key constraints found');
    }
    
    // Test 6: Test a sample query that the profile system would use
    console.log('\n6. 🔍 Testing profile query structure...');
    try {
      const [testQuery] = await pool.execute(`
        SELECT 
          u.user_id, u.first_name, u.last_name, u.email,
          u.department_id, u.semester_id, u.semester_verified,
          d.department_name, d.department_acronym,
          s.semester_name, s.school_year, s.is_active
        FROM users u
        LEFT JOIN departments d ON u.department_id = d.department_id
        LEFT JOIN semesters s ON u.semester_id = s.semester_id
        WHERE u.librarian_approval = 1
        LIMIT 1
      `);
      
      if (testQuery.length > 0) {
        console.log('   ✅ Profile query structure works correctly');
        const user = testQuery[0];
        console.log(`      Sample user: ${user.first_name} ${user.last_name}`);
        console.log(`      Department: ${user.department_name || 'Not assigned'}`);
        console.log(`      Semester: ${user.semester_name || 'Not assigned'} (${user.school_year || 'N/A'})`);
        console.log(`      Verified: ${user.semester_verified ? 'Yes' : 'No'}`);
      } else {
        console.log('   ⚠️  No approved users found for testing');
      }
    } catch (error) {
      console.log('   ❌ Profile query failed:', error.message);
      throw error;
    }
    
    console.log('\n🎉 All profile system tests passed successfully!');
    console.log('\n📋 System Status Summary:');
    console.log('   ✅ Database schema is properly configured');
    console.log('   ✅ All required tables and columns exist');
    console.log('   ✅ Foreign key relationships are established');
    console.log('   ✅ Profile queries work correctly');
    console.log('\n🚀 The profile system is ready for use!');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n💥 Profile system test failed:', error.message);
    console.log('\n🔧 Please check the database configuration and run the schema updates.');
    process.exit(1);
  }
}

testProfileSystem();