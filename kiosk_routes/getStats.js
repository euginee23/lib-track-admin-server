const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
require('dotenv').config();

// Get upload domain from environment
const UPLOAD_DOMAIN = (process.env.UPLOAD_DOMAIN || 'https://uploads.codehub.site').replace(/\/+$/, '');

// GET /api/stats/top-books - Get top 10 most borrowed books
router.get('/top-books', async (req, res) => {
  try {
    const sql = `
      SELECT 
        b.book_id,
        b.book_title,
        ba.book_author,
        CASE 
          WHEN bc.file_path IS NOT NULL AND bc.file_path != '' THEN CONCAT('${UPLOAD_DOMAIN}', bc.file_path)
          ELSE NULL 
        END AS book_cover,
        b.batch_registration_key,
        COUNT(t.transaction_id) as borrow_count
      FROM transactions t
      INNER JOIN books b ON t.book_id = b.book_id
      LEFT JOIN book_covers bc ON b.batch_registration_key = bc.batch_registration_key
      LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
      WHERE t.transaction_type = 'Borrow'
      GROUP BY b.book_id, b.book_title, ba.book_author, bc.file_path, b.batch_registration_key
      ORDER BY borrow_count DESC
      LIMIT 10
    `;
    
    const [rows] = await pool.execute(sql);
    
    return res.json({ 
      success: true, 
      data: rows 
    });
  } catch (error) {
    console.error('Error fetching top borrowed books:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch top borrowed books', 
      error: error.message 
    });
  }
});

// GET /api/stats/top-departments - Get top 3 most active departments
router.get('/top-departments', async (req, res) => {
  try {
    const sql = `
      SELECT 
        d.department_id,
        d.department_name,
        d.department_acronym,
        COUNT(t.transaction_id) as transaction_count
      FROM transactions t
      INNER JOIN users u ON t.user_id = u.user_id
      INNER JOIN departments d ON u.department_id = d.department_id
      WHERE t.transaction_type = 'Borrow'
      GROUP BY d.department_id, d.department_name, d.department_acronym
      ORDER BY transaction_count DESC
      LIMIT 3
    `;
    
    const [rows] = await pool.execute(sql);
    
    return res.json({ 
      success: true, 
      data: rows 
    });
  } catch (error) {
    console.error('Error fetching top departments:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch top departments', 
      error: error.message 
    });
  }
});

// GET /api/stats/top-borrowers - Get top 5 student borrowers
router.get('/top-borrowers', async (req, res) => {
  try {
    const sql = `
      SELECT 
        u.user_id,
        u.first_name,
        u.middle_name,
        u.last_name,
        u.student_id,
        u.position,
        d.department_name,
        d.department_acronym,
        COUNT(t.transaction_id) as borrow_count
      FROM transactions t
      INNER JOIN users u ON t.user_id = u.user_id
      LEFT JOIN departments d ON u.department_id = d.department_id
      WHERE t.transaction_type = 'Borrow' AND u.position = 'Student'
      GROUP BY u.user_id, u.first_name, u.middle_name, u.last_name, u.student_id, u.position, d.department_name, d.department_acronym
      ORDER BY borrow_count DESC
      LIMIT 5
    `;
    
    const [rows] = await pool.execute(sql);
    
    return res.json({ 
      success: true, 
      data: rows 
    });
  } catch (error) {
    console.error('Error fetching top borrowers:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch top borrowers', 
      error: error.message 
    });
  }
});

// GET /api/stats/summary - Get all statistics in one call
router.get('/summary', async (req, res) => {
  try {
    // Top 10 borrowed books
    const [topBooks] = await pool.execute(`
      SELECT 
        b.book_id,
        b.book_title,
        ba.book_author,
        CASE 
          WHEN bc.file_path IS NOT NULL AND bc.file_path != '' THEN CONCAT('${UPLOAD_DOMAIN}', bc.file_path)
          ELSE NULL 
        END AS book_cover,
        b.batch_registration_key,
        COUNT(t.transaction_id) as borrow_count
      FROM transactions t
      INNER JOIN books b ON t.book_id = b.book_id
      LEFT JOIN book_covers bc ON b.batch_registration_key = bc.batch_registration_key
      LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
      WHERE t.transaction_type = 'Borrow'
      GROUP BY b.book_id, b.book_title, ba.book_author, bc.file_path, b.batch_registration_key
      ORDER BY borrow_count DESC
      LIMIT 10
    `);

    // Top 3 departments
    const [topDepartments] = await pool.execute(`
      SELECT 
        d.department_id,
        d.department_name,
        d.department_acronym,
        COUNT(t.transaction_id) as transaction_count
      FROM transactions t
      INNER JOIN users u ON t.user_id = u.user_id
      INNER JOIN departments d ON u.department_id = d.department_id
      WHERE t.transaction_type = 'Borrow'
      GROUP BY d.department_id, d.department_name, d.department_acronym
      ORDER BY transaction_count DESC
      LIMIT 3
    `);

    // Top 5 student borrowers
    const [topBorrowers] = await pool.execute(`
      SELECT 
        u.user_id,
        u.first_name,
        u.middle_name,
        u.last_name,
        u.student_id,
        u.position,
        d.department_name,
        d.department_acronym,
        COUNT(t.transaction_id) as borrow_count
      FROM transactions t
      INNER JOIN users u ON t.user_id = u.user_id
      LEFT JOIN departments d ON u.department_id = d.department_id
      WHERE t.transaction_type = 'Borrow' AND u.position = 'Student'
      GROUP BY u.user_id, u.first_name, u.middle_name, u.last_name, u.student_id, u.position, d.department_name, d.department_acronym
      ORDER BY borrow_count DESC
      LIMIT 5
    `);

    return res.json({
      success: true,
      data: {
        topBooks,
        topDepartments,
        topBorrowers
      }
    });
  } catch (error) {
    console.error('Error fetching statistics summary:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics summary',
      error: error.message
    });
  }
});

module.exports = router;