// routes/fingerprintTemplate_Uploads.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const router = express.Router();

// Folder where fingerprint template uploads will be stored
const FINGERPRINT_UPLOAD_DIR = '/var/www/uploads/fingerprint-templates';

// Domain for serving uploaded files (from .env). Default kept for backward compatibility.
const UPLOAD_DOMAIN = (process.env.UPLOAD_DOMAIN || 'https://uploads.codehub.site').replace(/\/+$/, '');

// Ensure fingerprint template upload directory exists
if (!fs.existsSync(FINGERPRINT_UPLOAD_DIR)) {
  fs.mkdirSync(FINGERPRINT_UPLOAD_DIR, { recursive: true });
}

// Configure multer disk storage for fingerprint templates
const fingerprintStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, FINGERPRINT_UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Use the original filename provided by the client
    // The server will send files with the correct user_id_XXX_fingerprint.dat as filename
    cb(null, file.originalname);
  },
});

const uploadFingerprint = multer({ 
  storage: fingerprintStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  }
});

/**
 * ✅ Upload a new fingerprint template
 * POST /api/uploads/fingerprint-template
 * Form-data: file=<template>
 */
router.post('/fingerprint-template', uploadFingerprint.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const fileUrl = `${UPLOAD_DOMAIN}/fingerprint-templates/${req.file.filename}`;
  res.json({
    success: true,
    message: 'Fingerprint template uploaded successfully',
    file: {
      name: req.file.filename,
      url: fileUrl,
      size: req.file.size,
      type: req.file.mimetype,
    },
  });
});

/**
 * 📂 Get all uploaded fingerprint templates
 * GET /api/uploads/fingerprint-templates
 */
router.get('/fingerprint-templates', (req, res) => {
  fs.readdir(FINGERPRINT_UPLOAD_DIR, (err, files) => {
    if (err) return res.status(500).json({ success: false, message: 'Unable to read directory' });

    const fileList = files.map((filename) => ({
      name: filename,
      url: `${UPLOAD_DOMAIN}/fingerprint-templates/${filename}`,
    }));

    res.json({ success: true, files: fileList });
  });
});

/**
 * ❌ Delete a fingerprint template
 * DELETE /api/uploads/fingerprint-template/:filename
 */
router.delete('/fingerprint-template/:filename', (req, res) => {
  const filePath = path.join(FINGERPRINT_UPLOAD_DIR, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  fs.unlink(filePath, (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to delete file' });
    res.json({ success: true, message: 'File deleted successfully' });
  });
});

/**
 * 📝 Rename a fingerprint template
 * PATCH /api/uploads/fingerprint-template/:filename
 * Body: { newName: "newFileName.dat" }
 */
router.patch('/fingerprint-template/:filename', express.json(), (req, res) => {
  const oldPath = path.join(FINGERPRINT_UPLOAD_DIR, req.params.filename);
  const newPath = path.join(FINGERPRINT_UPLOAD_DIR, req.body.newName);

  if (!fs.existsSync(oldPath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  fs.rename(oldPath, newPath, (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to rename file' });
    res.json({ success: true, message: 'File renamed successfully' });
  });
});

module.exports = router;
