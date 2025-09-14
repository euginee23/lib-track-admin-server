const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");
const QRCode = require("qrcode");

// UNDEFINED VALUE SQL PARAMS HELPER
function safe(val) {
  return val === undefined ? null : val;
}

// GET ALL BOOKS ROUTE
router.get("/", async (req, res) => {
  try {
    const [books] = await pool.execute(`
      SELECT 
        b.book_id,
        b.book_title,
        b.book_cover,
        b.book_number,
        b.book_qr,
        b.book_edition,
        b.book_year,
        b.book_price,
        b.book_donor,
        b.batch_registration_key,
        bg.book_genre_id AS genre_id,
        bg.book_genre AS genre,
        bp.book_publisher_id AS publisher_id,
        bp.publisher,
        ba.book_author_id AS author_id,
        ba.book_author AS author,
        bs.book_shelf_loc_id AS shelf_location_id,
        bs.shelf_column,
        bs.shelf_row,
        b.created_at
      FROM books b
      LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id
      LEFT JOIN book_publisher bp ON b.book_publisher_id = bp.book_publisher_id
      LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
      LEFT JOIN book_shelf_location bs ON b.book_shelf_location_id = bs.book_shelf_loc_id
      ORDER BY b.book_id DESC
    `);

    res.status(200).json({
      success: true,
      count: books.length,
      data: books,
    });
  } catch (error) {
    console.error("Error fetching books:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch books",
      error: error.message,
    });
  }
});

// GET BOOK BY BATCH REGISTRATION KEY ROUTE
router.get("/:batch_registration_key", async (req, res) => {
  try {
    const [books] = await pool.execute(
      `
      SELECT 
        b.book_id,
        b.book_title,
        b.book_cover,
        b.book_number,
        b.book_qr,
        b.book_edition,
        b.book_year,
        b.book_price,
        b.book_donor,
        bg.book_genre_id AS genre_id,
        bg.book_genre AS genre,
        bp.book_publisher_id AS publisher_id,
        bp.publisher,
        ba.book_author_id AS author_id,
        ba.book_author AS author,
        bs.book_shelf_loc_id AS shelf_location_id,
        bs.shelf_column,
        bs.shelf_row,
        b.created_at
      FROM books b
      LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id
      LEFT JOIN book_publisher bp ON b.book_publisher_id = bp.book_publisher_id
      LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
      LEFT JOIN book_shelf_location bs ON b.book_shelf_location_id = bs.book_shelf_loc_id
      WHERE b.batch_registration_key = ?
      LIMIT 1
    `,
      [req.params.batch_registration_key]
    );

    if (books.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    res.status(200).json({
      success: true,
      data: books[0],
    });
  } catch (error) {
    console.error("Error fetching book:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch book",
      error: error.message,
    });
  }
});

// INSERT BOOKS ROUTE
router.post("/add", (req, res) => {
  const upload = req.upload.single("bookCover");
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: "File upload error",
        error: err.message,
      });
    }

    try {
      console.log("Received book data:", req.body);
      console.log("Received file:", req.file);

      const {
        bookTitle,
        bookEdition,
        bookYear,
        bookPrice,
        bookDonor,
        genre,
        publisher,
        author,
        shelfColumn,
        shelfRow,
        quantity = 1,
      } = req.body;

      // VALIDATION
      if (!genre || !publisher || !author || !shelfColumn || !shelfRow) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
          error:
            "genre, publisher, author, shelfColumn, and shelfRow are required and cannot be null.",
        });
      }

      // MUST BE A POSITIVE NUMBER
      const qtyNumber = parseInt(quantity);
      if (isNaN(qtyNumber) || qtyNumber < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid quantity",
          error: "Quantity must be a positive number.",
        });
      }

      // GENERATE BATCH REGISTRATION KEY
      const batchRegistrationKey = `0x${Math.random()
        .toString(36)
        .substring(2, 10)}`;

      // GENRE
      const [genreResult] = await pool.execute(
        "INSERT INTO book_genre (book_genre, created_at) VALUES (?, ?)",
        [safe(genre), new Date()]
      );
      const genreId = genreResult.insertId;

      // PUBLISHER
      const [publisherResult] = await pool.execute(
        "INSERT INTO book_publisher (publisher, created_at) VALUES (?, ?)",
        [safe(publisher), new Date()]
      );
      const publisherId = publisherResult.insertId;

      // AUTHOR
      const [authorResult] = await pool.execute(
        "INSERT INTO book_author (book_author, created_at) VALUES (?, ?)",
        [safe(author), new Date()]
      );
      const authorId = authorResult.insertId;

      // SHELF LOCATION
      const [shelfResult] = await pool.execute(
        "INSERT INTO book_shelf_location (shelf_column, shelf_row, created_at) VALUES (?, ?, ?)",
        [safe(shelfColumn), safe(shelfRow), new Date()]
      );
      const shelfLocationId = shelfResult.insertId;

      // Insert multiple books based on quantity
      const bookIds = [];
      const now = new Date();

      for (let i = 1; i <= qtyNumber; i++) {
        const [bookResult] = await pool.execute(
          `INSERT INTO books (
            book_title, book_cover, book_number, book_qr, book_edition, book_year, book_price, book_donor,
            book_genre_id, book_publisher_id, book_shelf_location_id, book_author_id, batch_registration_key, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            safe(bookTitle),
            safe(req.file.buffer),
            i,
            null,
            safe(bookEdition),
            safe(bookYear),
            safe(bookPrice),
            safe(bookDonor),
            genreId,
            publisherId,
            shelfLocationId,
            authorId,
            batchRegistrationKey,
            now,
          ]
        );
        const insertedBookId = bookResult.insertId;
        bookIds.push(insertedBookId);

        // GENERATE QR CODE
        const qrData = `BookID:${insertedBookId}-No:${i}`;
        const qrCodeBuffer = await QRCode.toBuffer(qrData);

        await pool.execute("UPDATE books SET book_qr = ? WHERE book_id = ?", [
          qrCodeBuffer,
          insertedBookId,
        ]);
      }

      const bookId = bookIds[0];

      res.status(201).json({
        success: true,
        message: `Book added successfully (${qtyNumber} ${
          qtyNumber === 1 ? "copy" : "copies"
        })`,
        data: {
          bookIds,
          genreId,
          publisherId,
          authorId,
          shelfLocationId,
          batchRegistrationKey,
          quantity: qtyNumber,
        },
      });
    } catch (error) {
      console.error("Error adding book:", error);
      res.status(500).json({
        success: false,
        message: "Failed to add book",
        error: error.message,
      });
    }
  });
});

// UPDATE BOOK ROUTE
router.put("/:id", async (req, res) => {
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
      shelfRow,
    } = req.body;

    // Get the existing book to check if it exists
    const [bookCheck] = await pool.execute("SELECT * FROM books WHERE id = ?", [
      bookId,
    ]);

    if (bookCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    const existing = bookCheck[0];

    // Update genre if provided
    let genreId = existing.book_genre_id;
    if (genre) {
      const [genreResult] = await pool.execute(
        "UPDATE book_genre SET book_genre = ?, updated_at = ? WHERE id = ?",
        [genre, new Date(), genreId]
      );
    }

    // Update publisher if provided
    let publisherId = existing.book_publisher_id;
    if (publisher) {
      const [publisherResult] = await pool.execute(
        "UPDATE book_publisher SET publisher = ?, updated_at = ? WHERE id = ?",
        [publisher, new Date(), publisherId]
      );
    }

    // Update author if provided
    let authorId = existing.book_author_id;
    if (author) {
      const [authorResult] = await pool.execute(
        "UPDATE book_author SET book_author = ?, updated_at = ? WHERE id = ?",
        [author, new Date(), authorId]
      );
    }

    // Update shelf location if provided
    let shelfLocationId = existing.book_shelf_location_id;
    if (shelfColumn && shelfRow) {
      const [shelfResult] = await pool.execute(
        "UPDATE book_shelf_location SET shelf_column = ?, shelf_row = ?, updated_at = ? WHERE id = ?",
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
        bookId,
      ]
    );

    res.status(200).json({
      success: true,
      message: "Book updated successfully",
      data: {
        bookId,
        genreId,
        publisherId,
        authorId,
        shelfLocationId,
      },
    });
  } catch (error) {
    console.error("Error updating book:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update book",
      error: error.message,
    });
  }
});

// QR CODE SCAN ROUTE
router.post("/scan", async (req, res) => {
  try {
    const { qrData } = req.body;

    if (!qrData) {
      return res.status(400).json({
        success: false,
        message: "QR data is required",
        error: "Please provide the QR code data to scan",
      });
    }

    // Parse QR data format: "BookID:123-No:1"
    const qrPattern = /^BookID:(\d+)-No:(\d+)$/;
    const match = qrData.match(qrPattern);

    if (!match) {
      return res.status(400).json({
        success: false,
        message: "Invalid QR code format",
        error: "QR code does not match the expected format: BookID:xxx-No:xxx",
      });
    }

    const bookId = parseInt(match[1]);
    const bookNumber = parseInt(match[2]);

    // Fetch book details
    const [books] = await pool.execute(
      `
      SELECT 
        b.book_id,
        b.book_title,
        b.book_cover,
        b.book_number,
        b.book_qr,
        b.book_edition,
        b.book_year,
        b.book_price,
        b.book_donor,
        b.batch_registration_key,
        bg.book_genre_id AS genre_id,
        bg.book_genre AS genre,
        bp.book_publisher_id AS publisher_id,
        bp.publisher,
        ba.book_author_id AS author_id,
        ba.book_author AS author,
        bs.book_shelf_loc_id AS shelf_location_id,
        bs.shelf_column,
        bs.shelf_row,
        b.created_at
      FROM books b
      LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id
      LEFT JOIN book_publisher bp ON b.book_publisher_id = bp.book_publisher_id
      LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
      LEFT JOIN book_shelf_location bs ON b.book_shelf_location_id = bs.book_shelf_loc_id
      WHERE b.book_id = ? AND b.book_number = ?
      LIMIT 1
    `,
      [bookId, bookNumber]
    );

    if (books.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
        error: "No book found matching the scanned QR code",
      });
    }

    const book = books[0];

    // Convert book_cover buffer to base64 if it exists
    if (book.book_cover && Buffer.isBuffer(book.book_cover)) {
      book.book_cover = book.book_cover.toString('base64');
    }

    // Convert book_qr buffer to base64 if it exists
    if (book.book_qr && Buffer.isBuffer(book.book_qr)) {
      book.book_qr = book.book_qr.toString('base64');
    }

    res.status(200).json({
      success: true,
      message: "Book found successfully",
      data: {
        book,
        qrInfo: {
          bookId,
          bookNumber,
          scannedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error("Error scanning QR code:", error);
    res.status(500).json({
      success: false,
      message: "Failed to scan QR code",
      error: error.message,
    });
  }
});

module.exports = router;
