const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const bodyParser = require("body-parser");
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

// Routes
app.use('/api/books', require('./routes/books'));
// app.use('/api/research', require('./routes/research'));
// app.use('/api/dashboard', require('./routes/dashboard'));

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
