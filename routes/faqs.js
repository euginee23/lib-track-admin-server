const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// GET / - list faqs (optional query: q=text, active=1)
router.get('/', async (req, res) => {
	const q = (req.query.q || '').trim();
	const active = req.query.active;

	try {
		let sql = 'SELECT id, question, answer, is_active, sort_order, created_by, created_at, updated_at FROM faqs';
		const params = [];

		const where = [];
		if (q) {
			where.push('(question LIKE ? OR answer LIKE ?)');
			params.push(`%${q}%`, `%${q}%`);
		}
		if (active !== undefined) {
			where.push('is_active = ?');
			params.push(active === '1' || active === 'true' ? 1 : 0);
		}

		if (where.length) sql += ' WHERE ' + where.join(' AND ');

		sql += ' ORDER BY sort_order ASC, created_at DESC';

		const [rows] = await pool.query(sql, params);
		res.json({ success: true, data: rows });
	} catch (error) {
		console.error('Failed to fetch faqs:', error);
		res.status(500).json({ success: false, message: 'Failed to fetch FAQs' });
	}
});

// GET /:id - get single faq
router.get('/:id', async (req, res) => {
	const id = parseInt(req.params.id, 10);
	if (!id) return res.status(400).json({ success: false, message: 'Invalid id' });

	try {
		const [rows] = await pool.query('SELECT id, question, answer, is_active, sort_order, created_by, created_at, updated_at FROM faqs WHERE id = ?', [id]);
		if (rows.length === 0) return res.status(404).json({ success: false, message: 'FAQ not found' });
		res.json({ success: true, data: rows[0] });
	} catch (error) {
		console.error('Failed to fetch faq:', error);
		res.status(500).json({ success: false, message: 'Failed to fetch FAQ' });
	}
});

// POST / - create faq
router.post('/', async (req, res) => {
	const { question, answer, is_active = 1, sort_order = 0, created_by = null } = req.body;
	if (!question || !question.toString().trim() || !answer || !answer.toString().trim()) {
		return res.status(400).json({ success: false, message: 'Question and answer are required' });
	}

	try {
		const [result] = await pool.query(
			'INSERT INTO faqs (question, answer, is_active, sort_order, created_by) VALUES (?, ?, ?, ?, ?)',
			[question.toString().trim(), answer.toString().trim(), is_active ? 1 : 0, parseInt(sort_order, 10) || 0, created_by]
		);

		const insertId = result.insertId;
		const [rows] = await pool.query('SELECT id, question, answer, is_active, sort_order, created_by, created_at, updated_at FROM faqs WHERE id = ?', [insertId]);
		res.status(201).json({ success: true, data: rows[0] });
	} catch (error) {
		console.error('Failed to create faq:', error);
		res.status(500).json({ success: false, message: 'Failed to create FAQ' });
	}
});

// PUT /:id - update faq
router.put('/:id', async (req, res) => {
	const id = parseInt(req.params.id, 10);
	if (!id) return res.status(400).json({ success: false, message: 'Invalid id' });

	const { question, answer, is_active, sort_order } = req.body;

	try {
		// build dynamic set
		const updates = [];
		const params = [];
		if (question !== undefined) {
			updates.push('question = ?');
			params.push(question.toString().trim());
		}
		if (answer !== undefined) {
			updates.push('answer = ?');
			params.push(answer.toString().trim());
		}
		if (is_active !== undefined) {
			updates.push('is_active = ?');
			params.push(is_active ? 1 : 0);
		}
		if (sort_order !== undefined) {
			updates.push('sort_order = ?');
			params.push(parseInt(sort_order, 10) || 0);
		}

		if (updates.length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });

		params.push(id);
		const sql = `UPDATE faqs SET ${updates.join(', ')} WHERE id = ?`;
		const [result] = await pool.query(sql, params);

		if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'FAQ not found' });

		const [rows] = await pool.query('SELECT id, question, answer, is_active, sort_order, created_by, created_at, updated_at FROM faqs WHERE id = ?', [id]);
		res.json({ success: true, data: rows[0] });
	} catch (error) {
		console.error('Failed to update faq:', error);
		res.status(500).json({ success: false, message: 'Failed to update FAQ' });
	}
});

// DELETE /:id - delete faq
router.delete('/:id', async (req, res) => {
	const id = parseInt(req.params.id, 10);
	if (!id) return res.status(400).json({ success: false, message: 'Invalid id' });

	try {
		const [result] = await pool.query('DELETE FROM faqs WHERE id = ?', [id]);
		if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'FAQ not found' });
		res.json({ success: true, message: 'FAQ deleted' });
	} catch (error) {
		console.error('Failed to delete faq:', error);
		res.status(500).json({ success: false, message: 'Failed to delete FAQ' });
	}
});

module.exports = router;
