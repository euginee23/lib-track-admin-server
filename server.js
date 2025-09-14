const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const bodyParser = require("body-parser");
const multer = require("multer");
require("dotenv").config();

// DATABASE CONFIGURATION
const { testConnection } = require("./config/database");

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

// ROOT ROUTE
app.get("/", (req, res) => {
  res.json({
    message: "Library Tracker Admin Server",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
  });
});

// SERVER
const startServer = async () => {
  try {
    // START
    app.listen(PORT, () => {
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
