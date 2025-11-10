// routes/userCOR_Uploads.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const router = express.Router();

// Folder where user COR (Certificate of Registration or similar) uploads will be stored
const USER_COR_UPLOAD_DIR = '/var/www/uploads/user_cor';

// Domain for serving uploaded files (from .env). Default kept for backward compatibility.
const UPLOAD_DOMAIN = (process.env.UPLOAD_DOMAIN || 'https://uploads.codehub.site').replace(/\/+$/, '');

// Ensure upload directory exists
if (!fs.existsSync(USER_COR_UPLOAD_DIR)) {
  fs.mkdirSync(USER_COR_UPLOAD_DIR, { recursive: true });
}

// Configure multer disk storage for user COR files
const corStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, USER_COR_UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Use the original filename provided by the client by default
    // Frontend may provide a naming convention like user_<id>_cor.pdf
    cb(null, file.originalname);
  },
});

const uploadCor = multer({ 
  storage: corStorage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB max file size
  }
});

/**
 * ✅ Upload a new user COR
 * POST /api/uploads/user-cor
 * Form-data: file=<file>
 */
router.post('/user-cor', uploadCor.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const fileUrl = `${UPLOAD_DOMAIN}/user_cor/${req.file.filename}`;
  res.json({
    success: true,
    message: 'File uploaded successfully',
    file: {
      name: req.file.filename,
      url: fileUrl,
      size: req.file.size,
      type: req.file.mimetype,
    },
  });
});

/**
 * 📂 Get all uploaded user COR files
 * GET /api/uploads/user-cors
 */
router.get('/user-cors', (req, res) => {
  fs.readdir(USER_COR_UPLOAD_DIR, (err, files) => {
    if (err) return res.status(500).json({ success: false, message: 'Unable to read directory' });

    const fileList = files.map((filename) => ({
      name: filename,
      url: `${UPLOAD_DOMAIN}/user_cor/${filename}`,
    }));

    res.json({ success: true, files: fileList });
  });
});

/**
 * ❌ Delete a user COR file
 * DELETE /api/uploads/user-cor/:filename
 */
router.delete('/user-cor/:filename', (req, res) => {
  const filePath = path.join(USER_COR_UPLOAD_DIR, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  fs.unlink(filePath, (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to delete file' });
    res.json({ success: true, message: 'File deleted successfully' });
  });
});

/**
 * 📝 Rename a user COR file
 * PATCH /api/uploads/user-cor/:filename
 * Body: { newName: "newFileName.pdf" }
 */
router.patch('/user-cor/:filename', express.json(), (req, res) => {
  const oldPath = path.join(USER_COR_UPLOAD_DIR, req.params.filename);
  const newPath = path.join(USER_COR_UPLOAD_DIR, req.body.newName);

  if (!fs.existsSync(oldPath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  fs.rename(oldPath, newPath, (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to rename file' });
    res.json({ success: true, message: 'File renamed successfully' });
  });
});

module.exports = router;
