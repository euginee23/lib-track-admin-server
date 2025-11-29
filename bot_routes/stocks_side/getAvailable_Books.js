const express = require('express');
const router = express.Router();
const { pool } = require('../../config/database');
require('dotenv').config();

const UPLOAD_DOMAIN = (process.env.UPLOAD_DOMAIN || 'https://uploads.codehub.site').replace(/\/+$/g, '');

// GET available books
// Mounted at: /api/bot/stocks/available-books
router.get('/available-books', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT book_id, book_title, book_qr, status FROM books WHERE status = 'Available' ORDER BY book_id DESC`
    );

    const data = rows.map(r => ({
      book_id: r.book_id,
      book_title: r.book_title,
      book_qr: r.book_qr ? `${UPLOAD_DOMAIN}${r.book_qr}` : null,
      status: r.status
    }));

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('Error fetching available books:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch available books', error: error.message });
  }
});

module.exports = router;
