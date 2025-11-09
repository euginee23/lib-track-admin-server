const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Upload domain for file URLs
const UPLOAD_DOMAIN = (process.env.UPLOAD_DOMAIN || 'https://uploads.codehub.site').replace(/\/+$/, '');

// UNDEFINED VALUE SQL PARAMS HELPER
function safe(val) {
  return val === undefined ? null : val;
}

// GET ALL RESERVATIONS
router.get('/', async (req, res) => {
  try {
    const { user_id, status } = req.query;
    
    let whereConditions = [];
    let queryParams = [];
    
    if (user_id) {
      whereConditions.push('r.user_id = ?');
      queryParams.push(user_id);
    }
    
    if (status) {
      whereConditions.push('r.status = ?');
      queryParams.push(status);
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const [reservations] = await pool.execute(`
      SELECT 
        r.reservation_id,
        r.book_id,
        r.research_paper_id,
        r.user_id,
        r.status,
        r.reason,
        r.updated_at,
        u.first_name,
        u.last_name,
        u.email,
        u.contact_number,
        CASE 
          WHEN r.book_id IS NOT NULL THEN 'book'
          WHEN r.research_paper_id IS NOT NULL THEN 'research_paper'
          ELSE 'unknown'
        END AS reservation_type,
        -- Book details
        b.book_title,
        b.batch_registration_key,
        CASE 
          WHEN bc.file_path IS NOT NULL AND bc.file_path != '' THEN CONCAT('${UPLOAD_DOMAIN}', bc.file_path)
          ELSE NULL 
        END AS book_cover,
        b.book_number,
        CASE 
          WHEN b.book_qr IS NOT NULL AND b.book_qr != '' THEN CONCAT('${UPLOAD_DOMAIN}', b.book_qr)
          ELSE NULL 
        END AS book_qr,
        ba.book_author,
        bg.book_genre,
        d.department_name AS book_department,
        -- Research paper details
        rp.research_title,
        rp.year_publication,
        rp.research_paper_qr,
        GROUP_CONCAT(DISTINCT ra.author_name) AS research_authors,
        dept.department_name AS research_department
      FROM reservations r
      LEFT JOIN users u ON r.user_id = u.user_id
      LEFT JOIN books b ON r.book_id = b.book_id
      LEFT JOIN book_covers bc ON b.batch_registration_key = bc.batch_registration_key
      LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
      LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
      LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
      LEFT JOIN research_papers rp ON r.research_paper_id = rp.research_paper_id
      LEFT JOIN research_author ra ON rp.research_paper_id = ra.research_paper_id
      LEFT JOIN departments dept ON rp.department_id = dept.department_id
      ${whereClause}
      GROUP BY 
        r.reservation_id,
        r.book_id,
        r.research_paper_id,
        r.user_id,
        r.status,
        r.reason,
        r.updated_at,
        u.first_name,
        u.last_name,
        u.email,
        u.contact_number,
        b.book_title,
        b.batch_registration_key,
        bc.file_path,
        b.book_number,
        b.book_qr,
        ba.book_author,
        bg.book_genre,
        d.department_name,
        rp.research_title,
        rp.year_publication,
        rp.research_paper_qr,
        dept.department_name
      ORDER BY r.updated_at DESC
    `, queryParams);

    // Format the response
    const formattedReservations = reservations.map(reservation => {
      const baseData = {
        reservation_id: reservation.reservation_id,
        user_id: reservation.user_id,
        user_name: `${reservation.first_name} ${reservation.last_name}`,
        email: reservation.email,
        contact_number: reservation.contact_number,
        status: reservation.status,
        reason: reservation.reason,
        updated_at: reservation.updated_at,
        reservation_type: reservation.reservation_type
      };

      if (reservation.reservation_type === 'book') {
        return {
          ...baseData,
          book_id: reservation.book_id,
          book_title: reservation.book_title,
          batch_registration_key: reservation.batch_registration_key,
          book_cover: reservation.book_cover,
          book_number: reservation.book_number,
          book_qr: reservation.book_qr,
          author: reservation.book_author,
          genre: reservation.book_department || reservation.book_genre
        };
      } else if (reservation.reservation_type === 'research_paper') {
        return {
          ...baseData,
          research_paper_id: reservation.research_paper_id,
          research_title: reservation.research_title,
          year_publication: reservation.year_publication,
          research_paper_qr: reservation.research_paper_qr,
          authors: reservation.research_authors,
          department: reservation.research_department
        };
      }

      return baseData;
    });

    res.status(200).json({
      success: true,
      count: formattedReservations.length,
      data: formattedReservations
    });
  } catch (error) {
    console.error('Error fetching reservations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reservations',
      error: error.message
    });
  }
});

// GET RESERVATION BY ID
router.get('/:id', async (req, res) => {
  try {
    const [reservations] = await pool.execute(`
      SELECT 
        r.reservation_id,
        r.book_id,
        r.research_paper_id,
        r.user_id,
        r.status,
        r.reason,
        r.updated_at,
        u.first_name,
        u.last_name,
        u.email,
        u.contact_number,
        CASE 
          WHEN r.book_id IS NOT NULL THEN 'book'
          WHEN r.research_paper_id IS NOT NULL THEN 'research_paper'
          ELSE 'unknown'
        END AS reservation_type,
        -- Book details
        b.book_title,
        b.batch_registration_key,
        CASE 
          WHEN bc.file_path IS NOT NULL AND bc.file_path != '' THEN CONCAT('${UPLOAD_DOMAIN}', bc.file_path)
          ELSE NULL 
        END AS book_cover,
        b.book_number,
        CASE 
          WHEN b.book_qr IS NOT NULL AND b.book_qr != '' THEN CONCAT('${UPLOAD_DOMAIN}', b.book_qr)
          ELSE NULL 
        END AS book_qr,
        ba.book_author,
        bg.book_genre,
        d.department_name AS book_department,
        -- Research paper details
        rp.research_title,
        rp.year_publication,
        rp.research_paper_qr,
        GROUP_CONCAT(DISTINCT ra.author_name) AS research_authors,
        dept.department_name AS research_department
      FROM reservations r
      LEFT JOIN users u ON r.user_id = u.user_id
      LEFT JOIN books b ON r.book_id = b.book_id
      LEFT JOIN book_covers bc ON b.batch_registration_key = bc.batch_registration_key
      LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
      LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
      LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
      LEFT JOIN research_papers rp ON r.research_paper_id = rp.research_paper_id
      LEFT JOIN research_author ra ON rp.research_paper_id = ra.research_paper_id
      LEFT JOIN departments dept ON rp.department_id = dept.department_id
      WHERE r.reservation_id = ?
      GROUP BY 
        r.reservation_id,
        r.book_id,
        r.research_paper_id,
        r.user_id,
        r.status,
        r.reason,
        r.updated_at,
        u.first_name,
        u.last_name,
        u.email,
        u.contact_number,
        b.book_title,
        b.batch_registration_key,
        bc.file_path,
        b.book_number,
        b.book_qr,
        ba.book_author,
        bg.book_genre,
        d.department_name,
        rp.research_title,
        rp.year_publication,
        rp.research_paper_qr,
        dept.department_name
      LIMIT 1
    `, [req.params.id]);

    if (reservations.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found'
      });
    }

    const reservation = reservations[0];
    const formattedReservation = {
      reservation_id: reservation.reservation_id,
      user_id: reservation.user_id,
      user_name: `${reservation.first_name} ${reservation.last_name}`,
      email: reservation.email,
      contact_number: reservation.contact_number,
      status: reservation.status,
      reason: reservation.reason,
      updated_at: reservation.updated_at,
      reservation_type: reservation.reservation_type
    };

    if (reservation.reservation_type === 'book') {
      formattedReservation.book_id = reservation.book_id;
      formattedReservation.book_title = reservation.book_title;
      formattedReservation.batch_registration_key = reservation.batch_registration_key;
      formattedReservation.book_cover = reservation.book_cover;
      formattedReservation.book_number = reservation.book_number;
      formattedReservation.book_qr = reservation.book_qr;
      formattedReservation.author = reservation.book_author;
      formattedReservation.genre = reservation.book_department || reservation.book_genre;
    } else if (reservation.reservation_type === 'research_paper') {
      formattedReservation.research_paper_id = reservation.research_paper_id;
      formattedReservation.research_title = reservation.research_title;
      formattedReservation.year_publication = reservation.year_publication;
      formattedReservation.research_paper_qr = reservation.research_paper_qr;
      formattedReservation.authors = reservation.research_authors;
      formattedReservation.department = reservation.research_department;
    }

    res.status(200).json({
      success: true,
      data: formattedReservation
    });
  } catch (error) {
    console.error('Error fetching reservation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reservation',
      error: error.message
    });
  }
});

// CREATE NEW RESERVATION
router.post('/', async (req, res) => {
  try {
    const {
      book_id,
      research_paper_id,
      user_id,
      reason
    } = req.body;

    // VALIDATION - must have either book_id or research_paper_id, but not both
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    if ((!book_id && !research_paper_id) || (book_id && research_paper_id)) {
      return res.status(400).json({
        success: false,
        message: 'Must specify either book_id or research_paper_id, but not both'
      });
    }

    // Check if user exists
    const [users] = await pool.execute(
      'SELECT user_id FROM users WHERE user_id = ?',
      [user_id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if book or research paper exists
    if (book_id) {
      const [books] = await pool.execute(
        'SELECT book_id, status FROM books WHERE book_id = ?',
        [book_id]
      );

      if (books.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Book not found'
        });
      }

      // Check if book is available
      if (books[0].status !== 'Available') {
        return res.status(400).json({
          success: false,
          message: `Book is currently ${books[0].status} and cannot be reserved`
        });
      }

      // Check if user already has a pending reservation for this book
      const [existingReservations] = await pool.execute(
        'SELECT reservation_id FROM reservations WHERE user_id = ? AND book_id = ? AND status = ?',
        [user_id, book_id, 'Pending']
      );

      if (existingReservations.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'You already have a pending reservation for this book'
        });
      }
    }

    if (research_paper_id) {
      const [papers] = await pool.execute(
        'SELECT research_paper_id FROM research_papers WHERE research_paper_id = ?',
        [research_paper_id]
      );

      if (papers.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Research paper not found'
        });
      }

      // Check if user already has a pending reservation for this research paper
      const [existingReservations] = await pool.execute(
        'SELECT reservation_id FROM reservations WHERE user_id = ? AND research_paper_id = ? AND status = ?',
        [user_id, research_paper_id, 'Pending']
      );

      if (existingReservations.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'You already have a pending reservation for this research paper'
        });
      }
    }

    // Create the reservation
    const [result] = await pool.execute(
      `INSERT INTO reservations (book_id, research_paper_id, user_id, status, reason, updated_at) 
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [safe(book_id), safe(research_paper_id), user_id, 'Pending', safe(reason)]
    );

    res.status(201).json({
      success: true,
      message: 'Reservation created successfully',
      data: {
        reservation_id: result.insertId,
        book_id: book_id || null,
        research_paper_id: research_paper_id || null,
        user_id,
        status: 'Pending',
        reason: reason || null
      }
    });
  } catch (error) {
    console.error('Error creating reservation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create reservation',
      error: error.message
    });
  }
});

// UPDATE RESERVATION STATUS
router.put('/:id', async (req, res) => {
  try {
    const reservationId = req.params.id;
    const { status, reason } = req.body;

    // VALIDATION
    const validStatuses = ['Pending', 'Approved', 'Rejected'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Check if reservation exists and get book/research paper info
    const [reservations] = await pool.execute(
      'SELECT reservation_id, status, book_id, research_paper_id FROM reservations WHERE reservation_id = ?',
      [reservationId]
    );

    if (reservations.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found'
      });
    }

    const reservation = reservations[0];

    // Build update query
    const updateFields = [];
    const updateValues = [];

    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (reason !== undefined) {
      updateFields.push('reason = ?');
      updateValues.push(reason);
    }

    // Always update the timestamp
    updateFields.push('updated_at = NOW()');

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    updateValues.push(reservationId);

    await pool.execute(
      `UPDATE reservations SET ${updateFields.join(', ')} WHERE reservation_id = ?`,
      updateValues
    );

    // Update book or research paper status based on reservation status
    if (status) {
      if (reservation.book_id) {
        // Update book status
        if (status === 'Approved') {
          await pool.execute(
            'UPDATE books SET status = ? WHERE book_id = ?',
            ['Reserved', reservation.book_id]
          );
        } else if (status === 'Rejected') {
          await pool.execute(
            'UPDATE books SET status = ? WHERE book_id = ?',
            ['Available', reservation.book_id]
          );
        }
      } else if (reservation.research_paper_id) {
        // Update research paper status
        if (status === 'Approved') {
          await pool.execute(
            'UPDATE research_papers SET status = ? WHERE research_paper_id = ?',
            ['Reserved', reservation.research_paper_id]
          );
        } else if (status === 'Rejected') {
          await pool.execute(
            'UPDATE research_papers SET status = ? WHERE research_paper_id = ?',
            ['Available', reservation.research_paper_id]
          );
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Reservation updated successfully',
      data: {
        reservation_id: reservationId,
        status: status || reservation.status,
        reason: reason !== undefined ? reason : null,
        book_id: reservation.book_id,
        research_paper_id: reservation.research_paper_id
      }
    });
  } catch (error) {
    console.error('Error updating reservation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update reservation',
      error: error.message
    });
  }
});

// DELETE RESERVATION
router.delete('/:id', async (req, res) => {
  try {
    const reservationId = req.params.id;

    // Check if reservation exists
    const [reservations] = await pool.execute(
      'SELECT reservation_id FROM reservations WHERE reservation_id = ?',
      [reservationId]
    );

    if (reservations.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found'
      });
    }

    // Delete the reservation
    await pool.execute(
      'DELETE FROM reservations WHERE reservation_id = ?',
      [reservationId]
    );

    res.status(200).json({
      success: true,
      message: 'Reservation deleted successfully',
      data: {
        reservation_id: reservationId
      }
    });
  } catch (error) {
    console.error('Error deleting reservation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete reservation',
      error: error.message
    });
  }
});

// GET USER'S RESERVATIONS
router.get('/user/:user_id', async (req, res) => {
  try {
    const userId = req.params.user_id;
    const { status } = req.query;

    let whereClause = 'WHERE r.user_id = ?';
    let queryParams = [userId];

    if (status) {
      whereClause += ' AND r.status = ?';
      queryParams.push(status);
    }

    const [reservations] = await pool.execute(`
      SELECT 
        r.reservation_id,
        r.book_id,
        r.research_paper_id,
        r.status,
        r.reason,
        r.updated_at,
        CASE 
          WHEN r.book_id IS NOT NULL THEN 'book'
          WHEN r.research_paper_id IS NOT NULL THEN 'research_paper'
          ELSE 'unknown'
        END AS reservation_type,
        -- Book details
        b.book_title,
        b.batch_registration_key,
        CASE 
          WHEN bc.file_path IS NOT NULL AND bc.file_path != '' THEN CONCAT('${UPLOAD_DOMAIN}', bc.file_path)
          ELSE NULL 
        END AS book_cover,
        b.book_number,
        CASE 
          WHEN b.book_qr IS NOT NULL AND b.book_qr != '' THEN CONCAT('${UPLOAD_DOMAIN}', b.book_qr)
          ELSE NULL 
        END AS book_qr,
        ba.book_author,
        bg.book_genre,
        d.department_name AS book_department,
        -- Research paper details
        rp.research_title,
        rp.year_publication,
        rp.research_paper_qr,
        GROUP_CONCAT(DISTINCT ra.author_name) AS research_authors,
        dept.department_name AS research_department
      FROM reservations r
      LEFT JOIN books b ON r.book_id = b.book_id
      LEFT JOIN book_covers bc ON b.batch_registration_key = bc.batch_registration_key
      LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
      LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
      LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
      LEFT JOIN research_papers rp ON r.research_paper_id = rp.research_paper_id
      LEFT JOIN research_author ra ON rp.research_paper_id = ra.research_paper_id
      LEFT JOIN departments dept ON rp.department_id = dept.department_id
      ${whereClause}
      GROUP BY 
        r.reservation_id, 
        r.book_id, 
        r.research_paper_id, 
        r.status, 
        r.reason, 
        r.updated_at,
        b.book_title,
        b.batch_registration_key,
        bc.file_path,
        b.book_number,
        b.book_qr,
        ba.book_author,
        bg.book_genre,
        d.department_name,
        rp.research_title,
        rp.year_publication,
        rp.research_paper_qr,
        dept.department_name
      ORDER BY r.updated_at DESC
    `, queryParams);

    // Format the response
    const formattedReservations = reservations.map(reservation => {
      const baseData = {
        reservation_id: reservation.reservation_id,
        status: reservation.status,
        reason: reservation.reason,
        updated_at: reservation.updated_at,
        reservation_type: reservation.reservation_type
      };

      if (reservation.reservation_type === 'book') {
        return {
          ...baseData,
          book_id: reservation.book_id,
          book_title: reservation.book_title,
          batch_registration_key: reservation.batch_registration_key,
          book_cover: reservation.book_cover,
          book_number: reservation.book_number,
          book_qr: reservation.book_qr,
          author: reservation.book_author,
          genre: reservation.book_department || reservation.book_genre
        };
      } else if (reservation.reservation_type === 'research_paper') {
        return {
          ...baseData,
          research_paper_id: reservation.research_paper_id,
          research_title: reservation.research_title,
          year_publication: reservation.year_publication,
          research_paper_qr: reservation.research_paper_qr,
          authors: reservation.research_authors,
          department: reservation.research_department
        };
      }

      return baseData;
    });

    res.status(200).json({
      success: true,
      count: formattedReservations.length,
      data: formattedReservations
    });
  } catch (error) {
    console.error('Error fetching user reservations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user reservations',
      error: error.message
    });
  }
});

module.exports = router;
