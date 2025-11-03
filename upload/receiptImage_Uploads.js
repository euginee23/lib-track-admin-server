// routes/receiptImage_Uploads.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const router = express.Router();

// Folder where receipt uploads will be stored
const RECEIPT_UPLOAD_DIR = '/var/www/uploads/receipts';

// Domain for serving uploaded files (from .env). Default kept for backward compatibility.
const UPLOAD_DOMAIN = (process.env.UPLOAD_DOMAIN || 'https://uploads.codehub.site').replace(/\/+$/, '');

// Ensure receipt upload directory exists
if (!fs.existsSync(RECEIPT_UPLOAD_DIR)) {
  fs.mkdirSync(RECEIPT_UPLOAD_DIR, { recursive: true });
}

// Configure multer disk storage for receipts
const receiptStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, RECEIPT_UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Use the original filename provided by the client
    // The server will send files with the correct receipt_REFNUM_timestamp.ext as filename
    cb(null, file.originalname);
  },
});

const uploadReceipt = multer({ storage: receiptStorage });

/**
 * ✅ Upload a new receipt image
 * POST /api/uploads/receipt
 * Form-data: file=<image>
 */
router.post('/receipt', uploadReceipt.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const fileUrl = `${UPLOAD_DOMAIN}/receipts/${req.file.filename}`;
  res.json({
    success: true,
    message: 'Receipt image uploaded successfully',
    file: {
      name: req.file.filename,
      url: fileUrl,
      size: req.file.size,
      type: req.file.mimetype,
    },
  });
});

/**
 * 📂 Get all uploaded receipt images
 * GET /api/uploads/receipts
 */
router.get('/receipts', (req, res) => {
  fs.readdir(RECEIPT_UPLOAD_DIR, (err, files) => {
    if (err) return res.status(500).json({ success: false, message: 'Unable to read directory' });

    const fileList = files.map((filename) => ({
      name: filename,
      url: `${UPLOAD_DOMAIN}/receipts/${filename}`,
    }));

    res.json({ success: true, files: fileList });
  });
});

/**
 * ❌ Delete a receipt image
 * DELETE /api/uploads/receipt/:filename
 */
router.delete('/receipt/:filename', (req, res) => {
  const filePath = path.join(RECEIPT_UPLOAD_DIR, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  fs.unlink(filePath, (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to delete file' });
    res.json({ success: true, message: 'File deleted successfully' });
  });
});

/**
 * 📝 Rename a receipt image
 * PATCH /api/uploads/receipt/:filename
 * Body: { newName: "newFileName.jpg" }
 */
router.patch('/receipt/:filename', express.json(), (req, res) => {
  const oldPath = path.join(RECEIPT_UPLOAD_DIR, req.params.filename);
  const newPath = path.join(RECEIPT_UPLOAD_DIR, req.body.newName);

  if (!fs.existsSync(oldPath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  fs.rename(oldPath, newPath, (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to rename file' });
    res.json({ success: true, message: 'File renamed successfully' });
  });
});

module.exports = router;
