const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Helper for null SQL params
function safe(val) {
  return val === undefined ? null : val;
}

// POST /rate
// Payload: { user_id, star_rating, items: [{ book_id } | { research_paper_id } , ...], comment? }
router.post('/', async (req, res) => {
  try {
    let { user_id, star_rating, items, comment } = req.body;

    // Basic validation
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'user_id is required' });
    }

    // normalize items - accept single object or JSON string
    if (!items) {
      return res.status(400).json({ success: false, message: 'items array is required' });
    }
    if (typeof items === 'string') {
      try {
        items = JSON.parse(items);
      } catch (e) {
        return res.status(400).json({ success: false, message: 'items must be an array or JSON string' });
      }
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'items must be a non-empty array' });
    }

    // Validate star_rating if provided - can be per-item too
    const starIsValid = (s) => {
      if (s === undefined || s === null) return false;
      const n = Number(s);
      return !Number.isNaN(n) && n >= 0 && n <= 5;
    };

    // Check user exists
    const [userCheck] = await pool.execute('SELECT user_id FROM users WHERE user_id = ?', [user_id]);
    if (userCheck.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const results = [];

    for (const rawItem of items) {
      // item may be an object like { book_id: 123 } or { research_paper_id: 45 } or include its own star_rating/comment
      const item = rawItem || {};
      const bookId = item.book_id ? Number(item.book_id) : null;
      const researchPaperId = item.research_paper_id ? Number(item.research_paper_id) : null;
      const itemStar = starIsValid(item.star_rating) ? Number(item.star_rating) : (starIsValid(star_rating) ? Number(star_rating) : null);
      const itemComment = typeof item.comment === 'string' ? item.comment : (typeof comment === 'string' ? comment : null);

      if (!bookId && !researchPaperId) {
        results.push({ success: false, reason: 'missing_item_id', item: rawItem });
        continue;
      }

      if (itemStar === null) {
        results.push({ success: false, reason: 'missing_star_rating', item: rawItem });
        continue;
      }

      // Check if rating exists for this user+item
      let existing = [];
      if (bookId) {
        [existing] = await pool.execute('SELECT rating_id FROM ratings WHERE user_id = ? AND book_id = ? LIMIT 1', [user_id, bookId]);
      } else {
        [existing] = await pool.execute('SELECT rating_id FROM ratings WHERE user_id = ? AND research_paper_id = ? LIMIT 1', [user_id, researchPaperId]);
      }

      if (existing.length > 0) {
        const ratingId = existing[0].rating_id;
        await pool.execute(
          'UPDATE ratings SET star_rating = ?, comment = ?, created_at = NOW() WHERE rating_id = ?',
          [itemStar, itemComment, ratingId]
        );
        results.push({ success: true, action: 'updated', rating_id: ratingId, book_id: bookId, research_paper_id: researchPaperId, star_rating: itemStar });
      } else {
        const [ins] = await pool.execute(
          `INSERT INTO ratings (user_id, book_id, research_paper_id, star_rating, comment, created_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [user_id, safe(bookId), safe(researchPaperId), itemStar, itemComment]
        );
        results.push({ success: true, action: 'inserted', rating_id: ins.insertId, book_id: bookId, research_paper_id: researchPaperId, star_rating: itemStar });
      }
    }

    return res.status(200).json({ success: true, message: 'Ratings processed', total: results.length, results });
  } catch (error) {
    console.error('Error processing ratings:', error);
    return res.status(500).json({ success: false, message: 'Failed to process ratings', error: error.message });
  }
});

module.exports = router;
