const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// GET /api/kiosk/ratings
// Optional query params: book_id, research_paper_id, user_id, page, limit, sort (created_at|star_rating)
router.get('/', async (req, res) => {
  try {
    const { book_id, research_paper_id, user_id, page = 1, limit = 25, sort = 'created_at', order = 'DESC' } = req.query;

    const where = [];
    const params = [];

    if (book_id) {
      where.push('r.book_id = ?');
      params.push(Number(book_id));
    }
    if (research_paper_id) {
      where.push('r.research_paper_id = ?');
      params.push(Number(research_paper_id));
    }
    if (user_id) {
      where.push('r.user_id = ?');
      params.push(Number(user_id));
    }

    const allowedSort = ['created_at', 'star_rating'];
    const sortCol = allowedSort.includes(sort) ? sort : 'created_at';
    const sortOrder = String(order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const offset = (Number(page) - 1) * Number(limit);

    // Count total
    const countSql = `SELECT COUNT(*) as total FROM ratings r ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
    const [countRows] = await pool.execute(countSql, params);
    const total = countRows[0]?.total || 0;

    // Main query - join with users and optionally book/research titles if available
    // Ensure limit and offset are safe integers
    const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.min(1000, Math.floor(Number(limit))) : 25;
    const safeOffset = Number.isFinite(Number(offset)) && Number(offset) >= 0 ? Math.floor(Number(offset)) : 0;

    // NOTE: some MySQL servers / drivers have issues with parameterized LIMIT/OFFSET placeholders
    // so we inject the numeric values directly after sanitizing them to integers.
    const sql = `
      SELECT r.rating_id, r.user_id, r.book_id, r.research_paper_id, r.star_rating, r.comment, r.created_at,
             u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name,
             b.book_title, rp.research_title
      FROM ratings r
      LEFT JOIN users u ON u.user_id = r.user_id
      LEFT JOIN books b ON b.book_id = r.book_id
      LEFT JOIN research_papers rp ON rp.research_paper_id = r.research_paper_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY r.${sortCol} ${sortOrder}
      LIMIT ${safeLimit} OFFSET ${safeOffset}
    `;

    const [rows] = await pool.execute(sql, params);

    return res.json({ success: true, total, page: Number(page), limit: Number(limit), results: rows });
  } catch (error) {
    console.error('Error fetching ratings:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch ratings', error: error.message });
  }
});

// GET /api/kiosk/ratings/batch/:batch_key
// Returns aggregated rating info (average, count) and compiled comments for all books that share the same batch_registration_key
router.get('/batch/:batch_key', async (req, res) => {
  try {
    const batchKey = req.params.batch_key;
    if (!batchKey || String(batchKey).trim() === '') {
      return res.status(400).json({ success: false, message: 'batch_registration_key is required' });
    }

    // 1) overall aggregate across all ratings for books in the batch
    const aggSql = `
      SELECT
        COUNT(r.rating_id) AS ratings_count,
        AVG(r.star_rating) AS avg_rating
      FROM ratings r
      JOIN books b ON b.book_id = r.book_id
      WHERE b.batch_registration_key = ?
    `;
    const [aggRows] = await pool.execute(aggSql, [batchKey]);
    const ratings_count = aggRows[0]?.ratings_count || 0;
    const avg_rating = aggRows[0]?.avg_rating !== null ? Number(Number(aggRows[0].avg_rating).toFixed(2)) : null;

    // 2) compiled comments (most recent first) with minimal user info
    const commentsSql = `
      SELECT r.rating_id, r.user_id, r.star_rating, r.comment, r.created_at,
             u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name,
             r.book_id
      FROM ratings r
      JOIN books b ON b.book_id = r.book_id
      LEFT JOIN users u ON u.user_id = r.user_id
      WHERE b.batch_registration_key = ?
        AND r.comment IS NOT NULL
        AND TRIM(r.comment) <> ''
      ORDER BY r.created_at DESC
      LIMIT 250
    `;
    const [commentRows] = await pool.execute(commentsSql, [batchKey]);

    // 3) per-book breakdown (count + avg) for transparency
    const perBookSql = `
      SELECT b.book_id, b.batch_registration_key, b.book_title, COUNT(r.rating_id) AS count, AVG(r.star_rating) AS avg_rating
      FROM books b
      LEFT JOIN ratings r ON r.book_id = b.book_id
      WHERE b.batch_registration_key = ?
      GROUP BY b.book_id, b.book_title, b.batch_registration_key
      ORDER BY b.book_id
    `;
    const [perBookRows] = await pool.execute(perBookSql, [batchKey]);

    return res.json({
      success: true,
      batch_registration_key: batchKey,
      ratings_count: Number(ratings_count),
      avg_rating,
      comments: commentRows,
      per_book: perBookRows
    });
  } catch (error) {
    console.error('Error fetching batch ratings for key', req.params.batch_key, error);
    return res.status(500).json({ success: false, message: 'Failed to fetch batch ratings', error: error.message });
  }
});

// GET /api/kiosk/ratings/research/:research_paper_id
// Returns aggregated rating info (average, count) and compiled comments for a research paper
router.get('/research/:research_paper_id', async (req, res) => {
  try {
    const rpId = Number(req.params.research_paper_id);
    if (!rpId) {
      return res.status(400).json({ success: false, message: 'Invalid research_paper_id' });
    }

    const aggSql = `
      SELECT COUNT(r.rating_id) AS ratings_count, AVG(r.star_rating) AS avg_rating
      FROM ratings r
      WHERE r.research_paper_id = ?
    `;
    const [aggRows] = await pool.execute(aggSql, [rpId]);
    const ratings_count = aggRows[0]?.ratings_count || 0;
    const avg_rating = aggRows[0]?.avg_rating !== null ? Number(Number(aggRows[0].avg_rating).toFixed(2)) : null;

    const commentsSql = `
      SELECT r.rating_id, r.user_id, r.star_rating, r.comment, r.created_at,
             u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name
      FROM ratings r
      LEFT JOIN users u ON u.user_id = r.user_id
      WHERE r.research_paper_id = ?
        AND r.comment IS NOT NULL
        AND TRIM(r.comment) <> ''
      ORDER BY r.created_at DESC
      LIMIT 250
    `;
    const [commentRows] = await pool.execute(commentsSql, [rpId]);

    return res.json({
      success: true,
      research_paper_id: rpId,
      ratings_count: Number(ratings_count),
      avg_rating,
      comments: commentRows
    });
  } catch (error) {
    console.error('Error fetching research ratings for id', req.params.research_paper_id, error);
    return res.status(500).json({ success: false, message: 'Failed to fetch research ratings', error: error.message });
  }
});

// GET /api/kiosk/ratings/:id
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid rating id' });

    const sql = `
      SELECT r.rating_id, r.user_id, r.book_id, r.research_paper_id, r.star_rating, r.comment, r.created_at,
             u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name,
             b.book_title, rp.research_title
      FROM ratings r
      LEFT JOIN users u ON u.user_id = r.user_id
      LEFT JOIN books b ON b.book_id = r.book_id
      LEFT JOIN research_papers rp ON rp.research_paper_id = r.research_paper_id
      WHERE r.rating_id = ?
      LIMIT 1
    `;

    const [rows] = await pool.execute(sql, [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'Rating not found' });

    return res.json({ success: true, result: rows[0] });
  } catch (error) {
    console.error('Error fetching rating by id:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch rating', error: error.message });
  }
});

module.exports = router;

