// routes/researchQRCode_Uploads.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const router = express.Router();

// Folder where research QR code uploads will be stored
const RESEARCH_QR_UPLOAD_DIR = '/var/www/uploads/research-qr';

// Domain for serving uploaded files (from .env). Default kept for backward compatibility.
const UPLOAD_DOMAIN = (process.env.UPLOAD_DOMAIN || 'https://uploads.codehub.site').replace(/\/+$/, '');

// Ensure research QR upload directory exists
if (!fs.existsSync(RESEARCH_QR_UPLOAD_DIR)) {
  fs.mkdirSync(RESEARCH_QR_UPLOAD_DIR, { recursive: true });
}

// Configure multer disk storage for research QR codes
const researchQrStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, RESEARCH_QR_UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Use the original filename provided by the client
    // The server will send files with the correct research_id_XXX_QrCode.png as filename
    cb(null, file.originalname);
  },
});

const uploadResearchQr = multer({ 
  storage: researchQrStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  }
});

/**
 * ✅ Upload a new research QR code image
 * POST /api/uploads/research-qr-code
 * Form-data: file=<image>
 */
router.post('/research-qr-code', uploadResearchQr.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const fileUrl = `${UPLOAD_DOMAIN}/research-qr/${req.file.filename}`;
  res.json({
    success: true,
    message: 'Research QR image uploaded successfully',
    file: {
      name: req.file.filename,
      url: fileUrl,
      size: req.file.size,
      type: req.file.mimetype,
    },
  });
});

/**
 * 📂 Get all uploaded research QR code images
 * GET /api/uploads/research-qr-codes
 */
router.get('/research-qr-codes', (req, res) => {
  fs.readdir(RESEARCH_QR_UPLOAD_DIR, (err, files) => {
    if (err) return res.status(500).json({ success: false, message: 'Unable to read directory' });

    const fileList = files.map((filename) => ({
      name: filename,
      url: `${UPLOAD_DOMAIN}/research-qr/${filename}`,
    }));

    res.json({ success: true, files: fileList });
  });
});

/**
 * ❌ Delete a research QR code image
 * DELETE /api/uploads/research-qr-code/:filename
 */
router.delete('/research-qr-code/:filename', (req, res) => {
  const filePath = path.join(RESEARCH_QR_UPLOAD_DIR, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  fs.unlink(filePath, (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to delete file' });
    res.json({ success: true, message: 'File deleted successfully' });
  });
});

/**
 * 📝 Rename a research QR code image
 * PATCH /api/uploads/research-qr-code/:filename
 * Body: { newName: "newFileName.jpg" }
 */
router.patch('/research-qr-code/:filename', express.json(), (req, res) => {
  const oldPath = path.join(RESEARCH_QR_UPLOAD_DIR, req.params.filename);
  const newPath = path.join(RESEARCH_QR_UPLOAD_DIR, req.body.newName);

  if (!fs.existsSync(oldPath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  fs.rename(oldPath, newPath, (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to rename file' });
    res.json({ success: true, message: 'File renamed successfully' });
  });
});

module.exports = router;
