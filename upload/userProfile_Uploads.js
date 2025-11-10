// routes/userProfile_Uploads.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const router = express.Router();

// Folder where user profile uploads (avatars, images) will be stored
const USER_PROFILE_UPLOAD_DIR = '/var/www/uploads/user_profiles';

// Domain for serving uploaded files (from .env). Default kept for backward compatibility.
const UPLOAD_DOMAIN = (process.env.UPLOAD_DOMAIN || 'https://uploads.codehub.site').replace(/\/+$/, '');

// Ensure upload directory exists
if (!fs.existsSync(USER_PROFILE_UPLOAD_DIR)) {
  fs.mkdirSync(USER_PROFILE_UPLOAD_DIR, { recursive: true });
}

// Configure multer disk storage for user profiles
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, USER_PROFILE_UPLOAD_DIR),
  filename: (req, file, cb) => {
    // By default keep original filename. Frontend may use user_id or other key.
    cb(null, file.originalname);
  },
});

const uploadProfile = multer({ 
  storage: profileStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  }
});

/**
 * ✅ Upload a new user profile image
 * POST /api/uploads/user-profile
 * Form-data: file=<image>
 */
router.post('/user-profile', uploadProfile.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const fileUrl = `${UPLOAD_DOMAIN}/user_profiles/${req.file.filename}`;
  res.json({
    success: true,
    message: 'Profile uploaded successfully',
    file: {
      name: req.file.filename,
      url: fileUrl,
      size: req.file.size,
      type: req.file.mimetype,
    },
  });
});

/**
 * 📂 Get all uploaded user profile files
 * GET /api/uploads/user-profiles
 */
router.get('/user-profiles', (req, res) => {
  fs.readdir(USER_PROFILE_UPLOAD_DIR, (err, files) => {
    if (err) return res.status(500).json({ success: false, message: 'Unable to read directory' });

    const fileList = files.map((filename) => ({
      name: filename,
      url: `${UPLOAD_DOMAIN}/user_profiles/${filename}`,
    }));

    res.json({ success: true, files: fileList });
  });
});

/**
 * ❌ Delete a user profile file
 * DELETE /api/uploads/user-profile/:filename
 */
router.delete('/user-profile/:filename', (req, res) => {
  const filePath = path.join(USER_PROFILE_UPLOAD_DIR, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  fs.unlink(filePath, (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to delete file' });
    res.json({ success: true, message: 'File deleted successfully' });
  });
});

/**
 * 📝 Rename a user profile file
 * PATCH /api/uploads/user-profile/:filename
 * Body: { newName: "newFileName.jpg" }
 */
router.patch('/user-profile/:filename', express.json(), (req, res) => {
  const oldPath = path.join(USER_PROFILE_UPLOAD_DIR, req.params.filename);
  const newPath = path.join(USER_PROFILE_UPLOAD_DIR, req.body.newName);

  if (!fs.existsSync(oldPath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  fs.rename(oldPath, newPath, (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to rename file' });
    res.json({ success: true, message: 'File renamed successfully' });
  });
});

module.exports = router;
