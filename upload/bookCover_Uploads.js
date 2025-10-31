// routes/bookCover_Uploads.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const router = express.Router();

// Folder where book cover uploads will be stored
const UPLOAD_DIR = '/var/www/uploads/book_covers';

// Domain for serving uploaded files (from .env). Default kept for backward compatibility.
const UPLOAD_DOMAIN = (process.env.UPLOAD_DOMAIN || 'https://uploads.codehub.site').replace(/\/+$/, '');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure multer disk storage for book covers
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

/**
 * ✅ Upload a new book cover
 * POST /api/uploads/book-cover
 * Form-data: file=<image>
 */
router.post('/book-cover', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const fileUrl = `${UPLOAD_DOMAIN}/book_covers/${req.file.filename}`;
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
 * 📂 Get all uploaded book covers
 * GET /api/uploads/book-covers
 */
router.get('/book-covers', (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) return res.status(500).json({ success: false, message: 'Unable to read directory' });

    const fileList = files.map((filename) => ({
      name: filename,
      url: `${UPLOAD_DOMAIN}/book_covers/${filename}`,
    }));

    res.json({ success: true, files: fileList });
  });
});

/**
 * ❌ Delete a book cover
 * DELETE /api/uploads/book-cover/:filename
 */
router.delete('/book-cover/:filename', (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  fs.unlink(filePath, (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to delete file' });
    res.json({ success: true, message: 'File deleted successfully' });
  });
});

/**
 * 📝 Rename a file
 * PATCH /api/uploads/book-cover/:filename
 * Body: { newName: "newFileName.jpg" }
 */
router.patch('/book-cover/:filename', express.json(), (req, res) => {
  const oldPath = path.join(UPLOAD_DIR, req.params.filename);
  const newPath = path.join(UPLOAD_DIR, req.body.newName);

  if (!fs.existsSync(oldPath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  fs.rename(oldPath, newPath, (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to rename file' });
    res.json({ success: true, message: 'File renamed successfully' });
  });
});

module.exports = router;
