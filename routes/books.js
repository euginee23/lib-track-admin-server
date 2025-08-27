const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// UNDEFINED VALUE SQL PARAMS HELPER
function safe(val) {
  return val === undefined ? null : val;
}

// GET ALL GENRES
router.get('/genres', async (req, res) => {
  try {
    const [genres] = await pool.execute('SELECT * FROM book_genre ORDER BY book_genre');
    res.status(200).json({
      success: true,
      count: genres.length,
      data: genres
    });
  } catch (error) {
    console.error('Error fetching genres:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch genres',
      error: error.message
    });
  }
});

// GET ALL PUBLISHERS
router.get('/publishers', async (req, res) => {
  try {
    const [publishers] = await pool.execute('SELECT * FROM book_publisher ORDER BY publisher');
    res.status(200).json({
      success: true,
      count: publishers.length,
      data: publishers
    });
  } catch (error) {
    console.error('Error fetching publishers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch publishers',
      error: error.message
    });
  }
});

// GET ALL AUTHORS
router.get('/authors', async (req, res) => {
  try {
    const [authors] = await pool.execute('SELECT * FROM book_author ORDER BY book_author');
    res.status(200).json({
      success: true,
      count: authors.length,
      data: authors
    });
  } catch (error) {
    console.error('Error fetching authors:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch authors',
      error: error.message
    });
  }
});

// GET ALL SHELF LOCATIONS
router.get('/shelf-locations', async (req, res) => {
  try {
    const [locations] = await pool.execute('SELECT * FROM book_shelf_location ORDER BY shelf_column, shelf_row');
    res.status(200).json({
      success: true,
      count: locations.length,
      data: locations
    });
  } catch (error) {
    console.error('Error fetching shelf locations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shelf locations',
      error: error.message
    });
  }
});

// GET ALL BOOKS ROUTE
router.get('/', async (req, res) => {
  try {
    const [books] = await pool.execute(`
      SELECT 
        b.id,
        b.book_title,
        b.book_cover,
        b.book_number,
        b.book_qr,
        b.book_edition,
        b.book_year,
        b.book_price,
        b.book_donor,
        b.status,
        bg.id AS genre_id,
        bg.book_genre AS genre,
        bp.id AS publisher_id,
        bp.publisher,
        ba.id AS author_id,
        ba.book_author AS author,
        bs.id AS shelf_location_id,
        bs.shelf_column,
        bs.shelf_row,
        b.created_at
      FROM books b
      LEFT JOIN book_genre bg ON b.book_genre_id = bg.id
      LEFT JOIN book_publisher bp ON b.book_publisher_id = bp.id
      LEFT JOIN book_author ba ON b.book_author_id = ba.id
      LEFT JOIN book_shelf_location bs ON b.book_shelf_location_id = bs.id
      ORDER BY b.id DESC
    `);
    
    res.status(200).json({
      success: true,
      count: books.length,
      data: books
    });
  } catch (error) {
    console.error('Error fetching books:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch books',
      error: error.message
    });
  }
});

// GET BOOK BY ID ROUTE
router.get('/:id', async (req, res) => {
  try {
    const [books] = await pool.execute(`
      SELECT 
        b.id,
        b.book_title,
        b.book_cover,
        b.book_number,
        b.book_qr,
        b.book_edition,
        b.book_year,
        b.book_price,
        b.book_donor,
        b.status,
        bg.id AS genre_id,
        bg.book_genre AS genre,
        bp.id AS publisher_id,
        bp.publisher,
        ba.id AS author_id,
        ba.book_author AS author,
        bs.id AS shelf_location_id,
        bs.shelf_column,
        bs.shelf_row,
        b.created_at
      FROM books b
      LEFT JOIN book_genre bg ON b.book_genre_id = bg.id
      LEFT JOIN book_publisher bp ON b.book_publisher_id = bp.id
      LEFT JOIN book_author ba ON b.book_author_id = ba.id
      LEFT JOIN book_shelf_location bs ON b.book_shelf_location_id = bs.id
      WHERE b.id = ?
      LIMIT 1
    `, [req.params.id]);
    
    if (books.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: books[0]
    });
  } catch (error) {
    console.error('Error fetching book:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch book',
      error: error.message
    });
  }
});

// INSERT BOOKS ROUTE
router.post('/add', async (req, res) => {
  try {
    const {
      bookTitle,
      bookCover,
      bookQR,
      bookEdition,
      bookYear,
      bookPrice,
      bookDonor,
      genre,
      publisher,
      author,
      shelfColumn,
      shelfRow,
      quantity = 1
    } = req.body;

    const qtyNumber = parseInt(quantity);
    
    // VALIDATION
    if (!genre || !publisher || !author || !shelfColumn || !shelfRow) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        error: 'genre, publisher, author, shelfColumn, and shelfRow are required and cannot be null.'
      });
    }

    // MUST BE A POSITIVE NUMBER
    if (isNaN(qtyNumber) || qtyNumber < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quantity',
        error: 'Quantity must be a positive number.'
      });
    }

    // GENRE
    const [genreResult] = await pool.execute(
      'INSERT INTO book_genre (book_genre, created_at) VALUES (?, ?)',
      [safe(genre), new Date()]
    );
    const genreId = genreResult.insertId;

    // PUBLISHER
    const [publisherResult] = await pool.execute(
      'INSERT INTO book_publisher (publisher, created_at) VALUES (?, ?)',
      [safe(publisher), new Date()]
    );
    const publisherId = publisherResult.insertId;

    // AUTHOR
    const [authorResult] = await pool.execute(
      'INSERT INTO book_author (book_author, created_at) VALUES (?, ?)',
      [safe(author), new Date()]
    );
    const authorId = authorResult.insertId;

    // SHELF LOCATION
    const [shelfResult] = await pool.execute(
      'INSERT INTO book_shelf_location (shelf_column, shelf_row, created_at) VALUES (?, ?, ?)',
      [safe(shelfColumn), safe(shelfRow), new Date()]
    );
    const shelfLocationId = shelfResult.insertId;

    // Insert multiple books based on quantity
    const bookIds = [];
    const now = new Date();
    
    // Prepare the SQL for multiple inserts
    for (let i = 1; i <= qtyNumber; i++) {
      const [bookResult] = await pool.execute(
        `INSERT INTO books (
          book_title, book_cover, book_number, book_qr, book_edition, book_year, book_price, book_donor,
          book_genre_id, book_publisher_id, book_shelf_location_id, book_author_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          safe(bookTitle),
          safe(bookCover),
          i, // Book number starts at 1 and increments for each copy
          safe(bookQR),
          safe(bookEdition),
          safe(bookYear),
          safe(bookPrice),
          safe(bookDonor),
          genreId,
          publisherId,
          shelfLocationId,
          authorId,
          now
        ]
      );
      bookIds.push(bookResult.insertId);
    }
    
    // Use the first book ID as the main reference
    const bookId = bookIds[0];

    res.status(201).json({
      success: true,
      message: `Book added successfully (${qtyNumber} ${qtyNumber === 1 ? 'copy' : 'copies'})`,
      data: { 
        bookIds,
        genreId, 
        publisherId, 
        authorId, 
        shelfLocationId,
        quantity: qtyNumber
      }
    });
  } catch (error) {
    console.error('Error adding book:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add book',
      error: error.message
    });
  }
});

// UPDATE BOOK STATUS ROUTE
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const bookId = req.params.id;
    
    // Validate status
    const validStatuses = ['available', 'borrowed', 'lost', 'damaged', 'archived'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status',
        error: `Status must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    // Update book status
    const [result] = await pool.execute(
      'UPDATE books SET status = ?, updated_at = ? WHERE id = ?',
      [status, new Date(), bookId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Book status updated successfully',
      data: { id: bookId, status }
    });
  } catch (error) {
    console.error('Error updating book status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update book status',
      error: error.message
    });
  }
});

// DELETE BOOK ROUTE
router.delete('/:id', async (req, res) => {
  try {
    const bookId = req.params.id;
    
    // Get book details to find related records
    const [books] = await pool.execute(
      'SELECT book_genre_id, book_publisher_id, book_author_id, book_shelf_location_id FROM books WHERE id = ?',
      [bookId]
    );
    
    if (books.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }
    
    const book = books[0];
    
    // Delete the book record
    const [result] = await pool.execute(
      'DELETE FROM books WHERE id = ?',
      [bookId]
    );
    
    // Note: In a real-world application, you would need to check if other books are using
    // these references before deleting them. For simplicity, we're not doing that here.
    // Also, consider using a transaction for this operation.
    
    res.status(200).json({
      success: true,
      message: 'Book deleted successfully',
      data: { id: bookId }
    });
  } catch (error) {
    console.error('Error deleting book:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete book',
      error: error.message
    });
  }
});

// UPDATE BOOK ROUTE
router.put('/:id', async (req, res) => {
  try {
    const bookId = req.params.id;
    const {
      bookTitle,
      bookCover,
      bookQR,
      bookEdition,
      bookYear,
      bookPrice,
      bookDonor,
      genre,
      publisher,
      author,
      shelfColumn,
      shelfRow
    } = req.body;
    
    // Get the existing book to check if it exists
    const [bookCheck] = await pool.execute(
      'SELECT * FROM books WHERE id = ?',
      [bookId]
    );
    
    if (bookCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }
    
    const existing = bookCheck[0];
    
    // Update genre if provided
    let genreId = existing.book_genre_id;
    if (genre) {
      const [genreResult] = await pool.execute(
        'UPDATE book_genre SET book_genre = ?, updated_at = ? WHERE id = ?',
        [genre, new Date(), genreId]
      );
    }
    
    // Update publisher if provided
    let publisherId = existing.book_publisher_id;
    if (publisher) {
      const [publisherResult] = await pool.execute(
        'UPDATE book_publisher SET publisher = ?, updated_at = ? WHERE id = ?',
        [publisher, new Date(), publisherId]
      );
    }
    
    // Update author if provided
    let authorId = existing.book_author_id;
    if (author) {
      const [authorResult] = await pool.execute(
        'UPDATE book_author SET book_author = ?, updated_at = ? WHERE id = ?',
        [author, new Date(), authorId]
      );
    }
    
    // Update shelf location if provided
    let shelfLocationId = existing.book_shelf_location_id;
    if (shelfColumn && shelfRow) {
      const [shelfResult] = await pool.execute(
        'UPDATE book_shelf_location SET shelf_column = ?, shelf_row = ?, updated_at = ? WHERE id = ?',
        [shelfColumn, shelfRow, new Date(), shelfLocationId]
      );
    }
    
    // Update the book
    const [bookResult] = await pool.execute(
      `UPDATE books SET 
        book_title = COALESCE(?, book_title),
        book_cover = COALESCE(?, book_cover),
        book_qr = COALESCE(?, book_qr),
        book_edition = COALESCE(?, book_edition),
        book_year = COALESCE(?, book_year),
        book_price = COALESCE(?, book_price),
        book_donor = COALESCE(?, book_donor),
        updated_at = ?
      WHERE id = ?`,
      [
        safe(bookTitle),
        safe(bookCover),
        safe(bookQR),
        safe(bookEdition),
        safe(bookYear),
        safe(bookPrice),
        safe(bookDonor),
        new Date(),
        bookId
      ]
    );
    
    res.status(200).json({
      success: true,
      message: 'Book updated successfully',
      data: { 
        bookId,
        genreId, 
        publisherId, 
        authorId, 
        shelfLocationId
      }
    });
  } catch (error) {
    console.error('Error updating book:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update book',
      error: error.message
    });
  }
});

module.exports = router;
