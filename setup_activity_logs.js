const { pool } = require("./config/database");

async function setupActivityLogsTable() {
  try {
    console.log("🔄 Setting up activity_logs table...");

    // Check if table exists
    const [tables] = await pool.execute(
      "SHOW TABLES LIKE 'activity_logs'"
    );

    if (tables.length > 0) {
      console.log("✅ Table 'activity_logs' already exists");
      
      // Show structure
      const [columns] = await pool.execute("DESCRIBE activity_logs");
      console.log("\n📋 Table structure:");
      console.table(columns);
      
      // Count records
      const [count] = await pool.execute(
        "SELECT COUNT(*) as count FROM activity_logs"
      );
      console.log(`\n📊 Current records: ${count[0].count}`);
      
      return;
    }

    console.log("📝 Creating activity_logs table...");

    // Create the table
    await pool.execute(`
      CREATE TABLE activity_logs (
        activity_log_id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        action VARCHAR(255) NOT NULL,
        details TEXT,
        status VARCHAR(50) DEFAULT 'completed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_action (action),
        INDEX idx_created_at (created_at),
        INDEX idx_status (status),
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log("✅ Table 'activity_logs' created successfully!");

    // Verify creation
    const [newColumns] = await pool.execute("DESCRIBE activity_logs");
    console.log("\n📋 New table structure:");
    console.table(newColumns);

    console.log("\n✅ Setup complete!");

  } catch (error) {
    console.error("❌ Setup failed:", error.message);
    
    // If it's a foreign key error, provide helpful message
    if (error.message.includes("foreign key constraint")) {
      console.log("\n💡 Tip: The 'users' table must exist before creating 'activity_logs'");
      console.log("   Make sure your database is properly set up.");
    }
  } finally {
    process.exit(0);
  }
}

// Run setup
setupActivityLogsTable();
