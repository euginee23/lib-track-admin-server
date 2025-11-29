const express = require('express');
const router = express.Router();
const { pool } = require('../../config/database');
require('dotenv').config();

const UPLOAD_DOMAIN = (process.env.UPLOAD_DOMAIN || 'https://uploads.codehub.site').replace(/\/+$/g, '');

// GET available research papers
// Mounted at: /api/bot/stocks/available-research
router.get('/available-research', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT research_paper_id, research_title, research_paper_qr, status FROM research_papers WHERE status = 'Available' ORDER BY research_paper_id DESC`
    );

    const data = rows.map(r => ({
      research_paper_id: r.research_paper_id,
      research_title: r.research_title,
      research_paper_qr: r.research_paper_qr ? `${UPLOAD_DOMAIN}${r.research_paper_qr}` : null,
      status: r.status
    }));

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('Error fetching available research papers:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch available research papers', error: error.message });
  }
});

module.exports = router;
