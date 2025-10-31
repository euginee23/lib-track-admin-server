// routes/qrCode_Uploads.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const router = express.Router();

// Folder where QR code uploads will be stored
const QR_UPLOAD_DIR = '/var/www/uploads/qr_codes';

// Domain for serving uploaded files (from .env). Default kept for backward compatibility.
const UPLOAD_DOMAIN = (process.env.UPLOAD_DOMAIN || 'https://uploads.codehub.site').replace(/\/+$/, '');

// Ensure QR upload directory exists
if (!fs.existsSync(QR_UPLOAD_DIR)) {
  fs.mkdirSync(QR_UPLOAD_DIR, { recursive: true });
}

// Configure multer disk storage for QR codes
const qrStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, QR_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname));
  },
});

const uploadQr = multer({ storage: qrStorage });

/**
 * ✅ Upload a new QR code image
 * POST /api/uploads/qr-code
 * Form-data: file=<image>
 */
router.post('/qr-code', uploadQr.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const fileUrl = `${UPLOAD_DOMAIN}/qr_codes/${req.file.filename}`;
  res.json({
    success: true,
    message: 'QR image uploaded successfully',
    file: {
      name: req.file.filename,
      url: fileUrl,
      size: req.file.size,
      type: req.file.mimetype,
    },
  });
});

/**
 * 📂 Get all uploaded QR code images
 * GET /api/uploads/qr-codes
 */
router.get('/qr-codes', (req, res) => {
  fs.readdir(QR_UPLOAD_DIR, (err, files) => {
    if (err) return res.status(500).json({ success: false, message: 'Unable to read directory' });

    const fileList = files.map((filename) => ({
      name: filename,
      url: `${UPLOAD_DOMAIN}/qr_codes/${filename}`,
    }));

    res.json({ success: true, files: fileList });
  });
});

/**
 * ❌ Delete a QR code image
 * DELETE /api/uploads/qr-code/:filename
 */
router.delete('/qr-code/:filename', (req, res) => {
  const filePath = path.join(QR_UPLOAD_DIR, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  fs.unlink(filePath, (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to delete file' });
    res.json({ success: true, message: 'File deleted successfully' });
  });
});

/**
 * 📝 Rename a QR code image
 * PATCH /api/uploads/qr-code/:filename
 * Body: { newName: "newFileName.jpg" }
 */
router.patch('/qr-code/:filename', express.json(), (req, res) => {
  const oldPath = path.join(QR_UPLOAD_DIR, req.params.filename);
  const newPath = path.join(QR_UPLOAD_DIR, req.body.newName);

  if (!fs.existsSync(oldPath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  fs.rename(oldPath, newPath, (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to rename file' });
    res.json({ success: true, message: 'File renamed successfully' });
  });
});

module.exports = router;
