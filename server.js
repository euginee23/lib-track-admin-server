const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const bodyParser = require("body-parser");
const multer = require("multer");
const http = require("http");
require("dotenv").config();

// DATABASE CONFIGURATION
const { testConnection, pool } = require("./config/database");
const WebSocketServer = require("./websocket/websocket");

const app = express();
const PORT = process.env.PORT || 5000;

// MIDDLEWARE
app.use(helmet());
app.use(cors());
app.use(morgan("combined"));
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

// MULTER CONFIG FOR FILE UPLOADS
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// MULER INSTANCE
app.use((req, res, next) => {
  req.upload = upload;
  next();
});

// BOOKS ROUTE
app.use('/api/books', require('./routes/books'));

// RESEARCH ROUTE
app.use('/api/research-papers', require('./routes/research_papers'));

// SETTINGS ROUTE
app.use('/api/settings', require('./routes/settings'));

// USER REGISTRATION ROUTE
app.use('/api/users', require('./user_routes/registration'));
app.use('/api/users', require('./user_routes/getUsers'));
app.use('/api/users', require('./user_routes/updateUsers'));

// USER LOGIN ROUTE
app.use('/api/users', require('./user_routes/login'));

// USER PROFILE ROUTE
app.use('/api/users', require('./user_routes/profile'));


// EMAIL VERIFICATION ROUTE
const { sendVerification } = require("./smtp/sendEmailVerification");
const { verifyCode } = require("./smtp/verifyEmailVerification");

// SEND VERIFICATION CODE
app.post("/api/send-verification", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }
  try {
    const code = await sendVerification(email);
    res.status(200).json({ message: "Verification code sent." });
  } catch (error) {
    console.error("Error sending verification:", error);
    if (error.message === "User not found") {
      res.status(404).json({ message: "User not found. Please register first." });
    } else {
      res.status(500).json({ message: "Failed to send verification code." });
    }
  }
});

app.post("/api/verify-code", async (req, res) => {
  const { email, code } = req.body;
  console.log("Verify code request:", { email, code });
  
  if (!email || !code) {
    return res.status(400).json({ message: "Email and code are required." });
  }

  try {
    // GET USER ID FROM EMAIL
    const [rows] = await pool.query(
      `SELECT user_id, librarian_approval FROM users WHERE email = ?`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const userId = rows[0].user_id;
    const librarianApproval = rows[0].librarian_approval;
    console.log("User found:", { userId, librarianApproval });

    // VERIFY THE CODE
    const isValid = await verifyCode(userId, code, "Email Verification");
    console.log("Code verification result:", isValid);
    
    if (isValid) {
      res.status(200).json({ 
        message: "Email verified successfully.",
        librarian_approval: librarianApproval
      });
    } else {
      res.status(400).json({ message: "Invalid or expired verification code." });
    }
  } catch (error) {
    console.error("Error verifying code:", error);
    res.status(500).json({ message: "Failed to verify code." });
  }
});

// ROOT ROUTE
app.get("/", (req, res) => {
  res.json({
    message: "Library Tracker Admin Server",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
  });
});

// CREATE HTTP SERVER
const server = http.createServer(app);

// INITIALIZE WEBSOCKET SERVER
const wsServer = new WebSocketServer(server);
console.log("✅ WebSocket server started and ready for connections");
wsServer.broadcast({ message: "Server started" });

// SERVER
const startServer = async () => {
  try {
    // START
    server.listen(PORT, () => {
      console.log(`🚀 Library Tracker Admin Server running on port ${PORT}`);
    });

    // TEST DB CONNECTION
    await testConnection();
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
};

// INITIALIZE SERVER
startServer();
