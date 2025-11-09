const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// GET /api/notifications
// Optional query: user_id, page, limit
router.get('/', async (req, res) => {
  const { user_id, page = 1, limit = 50 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const perPage = Math.max(1, parseInt(limit, 10) || 50);
  const offset = (pageNum - 1) * perPage;

  try {
    let where = '';
    const params = [];
    if (user_id) {
      where = 'WHERE user_id = ?';
      params.push(user_id);
    }

    // total count
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM notifications ${where}`, params);
    const total = (countRows && countRows[0] && countRows[0].total) ? countRows[0].total : 0;

    // fetch rows
    const [rows] = await pool.query(
      `SELECT notification_id, notification_type, notification_message, user_id, created_at FROM notifications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, perPage, offset]
    );

    res.status(200).json({
      notifications: rows,
      pagination: {
        total,
        page: pageNum,
        limit: perPage,
        totalPages: Math.ceil(total / perPage)
      }
    });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// POST /api/notifications
// Body: { user_id, notification_type, notification_message }
router.post('/', async (req, res) => {
  const { user_id, notification_type, notification_message } = req.body;
  if (!user_id || !notification_message) {
    return res.status(400).json({ message: 'user_id and notification_message are required.' });
  }

  try {
  // Normalize notification_type to a string. If missing, default to a descriptive value.
  // The notifications table expects a textual type (e.g. 'Reservation Notification').
  const nt = (notification_type === null || notification_type === undefined) ? 'Reservation Notification' : String(notification_type);
    const created_at = new Date();
    const [result] = await pool.query(
      'INSERT INTO notifications (notification_type, notification_message, user_id, created_at) VALUES (?, ?, ?, ?)',
      [nt, notification_message, user_id, created_at]
    );

    const insertedId = result.insertId;
    const [rows] = await pool.query('SELECT notification_id, notification_type, notification_message, user_id, created_at FROM notifications WHERE notification_id = ?', [insertedId]);
    res.status(201).json({ notification: rows[0] });
  } catch (err) {
    console.error('Error creating notification:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// DELETE /api/notifications/:id - delete single notification
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM notifications WHERE notification_id = ?', [id]);
    if (result.affectedRows > 0) {
      res.status(200).json({ message: 'Notification deleted.', deletedId: id });
    } else {
      res.status(404).json({ message: 'Notification not found.' });
    }
  } catch (err) {
    console.error('Error deleting notification:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// DELETE /api/notifications (body: { ids: [id, ...] } or { user_id }) - batch delete or delete by user
router.delete('/', async (req, res) => {
  const { ids, user_id } = req.body;
  try {
    if (Array.isArray(ids) && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const [result] = await pool.query(`DELETE FROM notifications WHERE notification_id IN (${placeholders})`, ids);
      return res.status(200).json({ message: 'Notifications deleted.', deletedCount: result.affectedRows });
    }

    if (user_id) {
      const [result] = await pool.query('DELETE FROM notifications WHERE user_id = ?', [user_id]);
      return res.status(200).json({ message: 'Notifications for user deleted.', deletedCount: result.affectedRows });
    }

    return res.status(400).json({ message: 'Provide ids array or user_id to delete notifications.' });
  } catch (err) {
    console.error('Error batch deleting notifications:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;
