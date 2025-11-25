const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

// Helper to map DB row to API shape
const mapAdminRow = (row) => ({
  admin_id: row.admin_id,
  firstName: row.first_name,
  lastName: row.last_name,
  email: row.email,
  role: row.role,
  status: row.status,
  createdAt: row.created_at,
  lastLogin: row.last_login,
  permissions: {
    dashboard: !!row.perm_dashboard,
    manageBooks: !!row.perm_manage_books,
    bookReservations: !!row.perm_book_reservations,
    manageRegistrations: !!row.perm_manage_registrations,
    bookTransactions: !!row.perm_book_transactions,
    managePenalties: !!row.perm_manage_penalties,
    activityLogs: !!row.perm_activity_logs,
    settings: !!row.perm_settings,
    manageAdministrators: !!row.perm_manage_administrators,
  }
});

// GET all admins
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT admin_id, first_name, last_name, email, role, status, created_at, last_login,
              perm_dashboard, perm_manage_books, perm_book_reservations, perm_manage_registrations,
              perm_book_transactions, perm_manage_penalties, perm_activity_logs, perm_settings, perm_manage_administrators
       FROM administrators
       ORDER BY first_name, last_name`
    );

    const data = rows.map(mapAdminRow);
    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('Error fetching administrators:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch administrators', error: error.message });
  }
});

// GET single admin by id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute(
      `SELECT admin_id, first_name, last_name, email, role, status, created_at, last_login,
              perm_dashboard, perm_manage_books, perm_book_reservations, perm_manage_registrations,
              perm_book_transactions, perm_manage_penalties, perm_activity_logs, perm_settings, perm_manage_administrators
       FROM administrators WHERE admin_id = ? LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Administrator not found' });
    }

    res.status(200).json({ success: true, data: mapAdminRow(rows[0]) });
  } catch (error) {
    console.error('Error fetching administrator:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch administrator', error: error.message });
  }
});

// CREATE admin
router.post('/', async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    password,
    role = 'Admin',
    status = 'Active',
    permissions = {}
  } = req.body;

  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  try {
    // check email uniqueness
    const [existing] = await pool.execute(`SELECT admin_id FROM administrators WHERE email = ? LIMIT 1`, [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const perm = {
      dashboard: permissions.dashboard ? 1 : 0,
      manageBooks: permissions.manageBooks ? 1 : 0,
      bookReservations: permissions.bookReservations ? 1 : 0,
      manageRegistrations: permissions.manageRegistrations ? 1 : 0,
      bookTransactions: permissions.bookTransactions ? 1 : 0,
      managePenalties: permissions.managePenalties ? 1 : 0,
      activityLogs: permissions.activityLogs ? 1 : 0,
      settings: permissions.settings ? 1 : 0,
      manageAdministrators: permissions.manageAdministrators ? 1 : 0,
    };

    const [result] = await pool.execute(
      `INSERT INTO administrators (
        first_name, last_name, email, password_hash, role, status,
        perm_dashboard, perm_manage_books, perm_book_reservations, perm_manage_registrations,
        perm_book_transactions, perm_manage_penalties, perm_activity_logs, perm_settings, perm_manage_administrators,
        created_at
      ) VALUES (?,?,?,?,?,?, ?,?,?,?, ?,?,?,?,?, ?)`,
      [
        firstName,
        lastName,
        email,
        hash,
        role,
        status,
        perm.dashboard,
        perm.manageBooks,
        perm.bookReservations,
        perm.manageRegistrations,
        perm.bookTransactions,
        perm.managePenalties,
        perm.activityLogs,
        perm.settings,
        perm.manageAdministrators,
        new Date()
      ]
    );

    const adminId = result.insertId;

    const [rows] = await pool.execute(
      `SELECT admin_id, first_name, last_name, email, role, status, created_at, last_login,
              perm_dashboard, perm_manage_books, perm_book_reservations, perm_manage_registrations,
              perm_book_transactions, perm_manage_penalties, perm_activity_logs, perm_settings, perm_manage_administrators
       FROM administrators WHERE admin_id = ? LIMIT 1`,
      [adminId]
    );

    res.status(201).json({ success: true, message: 'Administrator created', data: mapAdminRow(rows[0]) });
  } catch (error) {
    console.error('Error creating administrator:', error);
    res.status(500).json({ success: false, message: 'Failed to create administrator', error: error.message });
  }
});

// UPDATE admin
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    firstName,
    lastName,
    email,
    password,
    role,
    status,
    permissions = {}
  } = req.body;

  try {
    const [existing] = await pool.execute(`SELECT * FROM administrators WHERE admin_id = ? LIMIT 1`, [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Administrator not found' });
    }

    // Check email uniqueness if changed
    if (email && email !== existing[0].email) {
      const [emailExists] = await pool.execute(`SELECT admin_id FROM administrators WHERE email = ? AND admin_id <> ? LIMIT 1`, [email, id]);
      if (emailExists.length > 0) {
        return res.status(409).json({ success: false, message: 'Email already in use by another account' });
      }
    }

    const perm = {
      dashboard: permissions.dashboard ? 1 : 0,
      manageBooks: permissions.manageBooks ? 1 : 0,
      bookReservations: permissions.bookReservations ? 1 : 0,
      manageRegistrations: permissions.manageRegistrations ? 1 : 0,
      bookTransactions: permissions.bookTransactions ? 1 : 0,
      managePenalties: permissions.managePenalties ? 1 : 0,
      activityLogs: permissions.activityLogs ? 1 : 0,
      settings: permissions.settings ? 1 : 0,
      manageAdministrators: permissions.manageAdministrators ? 1 : 0,
    };

    // Build query dynamically to avoid overwriting password when not provided
    const updates = [];
    const params = [];

    if (firstName !== undefined) { updates.push('first_name = ?'); params.push(firstName); }
    if (lastName !== undefined) { updates.push('last_name = ?'); params.push(lastName); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (role !== undefined) { updates.push('role = ?'); params.push(role); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }

    // permissions always present as object (could be empty) — include them
    updates.push(
      'perm_dashboard = ?', 'perm_manage_books = ?', 'perm_book_reservations = ?', 'perm_manage_registrations = ?',
      'perm_book_transactions = ?', 'perm_manage_penalties = ?', 'perm_activity_logs = ?', 'perm_settings = ?', 'perm_manage_administrators = ?'
    );
    params.push(
      perm.dashboard, perm.manageBooks, perm.bookReservations, perm.manageRegistrations,
      perm.bookTransactions, perm.managePenalties, perm.activityLogs, perm.settings, perm.manageAdministrators
    );

    if (password) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);
      updates.push('password_hash = ?');
      params.push(hash);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    params.push(id);

    const sql = `UPDATE administrators SET ${updates.join(', ')} WHERE admin_id = ?`;
    const [result] = await pool.execute(sql, params);

    // Fetch updated record
    const [rows] = await pool.execute(
      `SELECT admin_id, first_name, last_name, email, role, status, created_at, last_login,
              perm_dashboard, perm_manage_books, perm_book_reservations, perm_manage_registrations,
              perm_book_transactions, perm_manage_penalties, perm_activity_logs, perm_settings, perm_manage_administrators
       FROM administrators WHERE admin_id = ? LIMIT 1`,
      [id]
    );

    res.status(200).json({ success: true, message: 'Administrator updated', data: mapAdminRow(rows[0]) });
  } catch (error) {
    console.error('Error updating administrator:', error);
    res.status(500).json({ success: false, message: 'Failed to update administrator', error: error.message });
  }
});

// DELETE admin
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [existing] = await pool.execute(`SELECT role FROM administrators WHERE admin_id = ? LIMIT 1`, [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Administrator not found' });
    }

    // Prevent deleting Super Admin via API
    if (existing[0].role === 'Super Admin') {
      return res.status(403).json({ success: false, message: 'Cannot delete a Super Admin via this endpoint' });
    }

    const [result] = await pool.execute(`DELETE FROM administrators WHERE admin_id = ?`, [id]);
    res.status(200).json({ success: true, message: 'Administrator deleted', affectedRows: result.affectedRows });
  } catch (error) {
    console.error('Error deleting administrator:', error);
    res.status(500).json({ success: false, message: 'Failed to delete administrator', error: error.message });
  }
});

module.exports = router;
