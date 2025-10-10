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
        bs.shelf_number,
        bs.shelf_column,
        bs.shelf_row,
        b.status,
        b.created_at
      FROM books b
      LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id
      LEFT JOIN book_publisher bp ON b.book_publisher_id = bp.book_publisher_id
      LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
      LEFT JOIN book_shelf_location bs ON b.book_shelf_location_id = bs.book_shelf_loc_id
      ORDER BY b.book_id DESC
    `);

    const activeBooksCount = books.filter(b => b.status !== 'Removed').length;
    res.status(200).json({
      success: true,
      count: activeBooksCount,
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
        bs.shelf_number,
        bs.shelf_column,
        bs.shelf_row,
        b.status,
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

    if (books.length > 0) {
      const [allBooks] = await pool.execute(
        `SELECT * FROM books WHERE batch_registration_key = ?`,
        [req.params.batch_registration_key]
      );
      const activeBooks = allBooks.filter(b => b.status !== 'Removed');
      const bookData = {
        ...books[0],
        quantity: activeBooks.length,
      };
      res.status(200).json({
        success: true,
        data: bookData,
      });
    } else {
      res.status(200).json({
        success: true,
        data: books[0],
      });
    }
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
      console.error("File upload error:", err);
      let errorMessage = "File upload error";
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        errorMessage = "File size too large. Maximum file size is 30MB.";
      } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        errorMessage = "Unexpected file field. Please upload only the book cover.";
      } else if (err.code === 'LIMIT_FIELD_COUNT') {
        errorMessage = "Too many fields in the request.";
      } else {
        errorMessage = err.message;
      }
      
      return res.status(400).json({
        success: false,
        message: errorMessage,
        error: err.code || err.message,
      });
    }

    try {
      console.log("Received book data:", req.body);
      console.log("Received file:", req.file ? {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      } : null);

      // Validate file upload
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Book cover is required",
          error: "Please upload a book cover image",
        });
      }

      // Validate file type
      const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: "Invalid file type",
          error: "Only JPEG, PNG, GIF, and WEBP images are allowed",
        });
      }

      // Validate file size (should be caught by multer, but double-check)
      if (req.file.size > 30 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: "File too large",
          error: "Book cover must be less than 30MB",
        });
      }

      const {
        bookTitle,
        bookEdition,
        bookYear,
        bookPrice,
        bookDonor,
        genre,
        publisher,
        publishers,
        author,
        authors,
        bookShelfLocId,
        quantity = 1,
      } = req.body;

      console.log("Authors data:", {
        author: author,
        authors: authors,
        authorsType: typeof authors,
        authorsIsArray: Array.isArray(authors)
      });
      console.log("Publishers data:", {
        publisher: publisher,
        publishers: publishers,
        publishersType: typeof publishers,
        publishersIsArray: Array.isArray(publishers)
      });

      // VALIDATION
      if (!genre || !publisher || !author || !bookShelfLocId) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
          error:
            "genre, publisher, author, and bookShelfLocId are required and cannot be null.",
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

      // PUBLISHER - Handle multiple publishers
      let finalPublisher = publisher;
      if (publishers && Array.isArray(publishers) && publishers.length > 0) {
        finalPublisher = publishers.join(", ");
      } else if (typeof publishers === 'string') {
        try {
          const parsedPublishers = JSON.parse(publishers);
          if (Array.isArray(parsedPublishers) && parsedPublishers.length > 0) {
            finalPublisher = parsedPublishers.join(", ");
          }
        } catch (e) {
          // If parsing fails, use the string as is
          finalPublisher = publishers;
        }
      }
      
      const [publisherResult] = await pool.execute(
        "INSERT INTO book_publisher (publisher, created_at) VALUES (?, ?)",
        [safe(finalPublisher), new Date()]
      );
      const publisherId = publisherResult.insertId;

      // AUTHOR - Handle multiple authors
      let finalAuthor = author;
      if (authors && Array.isArray(authors) && authors.length > 0) {
        finalAuthor = authors.join(", ");
      } else if (typeof authors === 'string') {
        try {
          const parsedAuthors = JSON.parse(authors);
          if (Array.isArray(parsedAuthors) && parsedAuthors.length > 0) {
            finalAuthor = parsedAuthors.join(", ");
          }
        } catch (e) {
          // If parsing fails, use the string as is
          finalAuthor = authors;
        }
      }
      
      const [authorResult] = await pool.execute(
        "INSERT INTO book_author (book_author, created_at) VALUES (?, ?)",
        [safe(finalAuthor), new Date()]
      );
      const authorId = authorResult.insertId;

      // SHELF LOCATION
      const shelfLocationId = safe(bookShelfLocId);

      if (!shelfLocationId) {
        return res.status(400).json({
          success: false,
          message: "Shelf location ID is required",
          error: "Please provide a valid shelf location ID.",
        });
      }

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
router.put("/:batch_registration_key", (req, res) => {
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
      const batchRegistrationKey = req.params.batch_registration_key;
      let {
        book_title,
        author,
        genre,
        publisher,
        book_edition,
        book_year,
        book_price,
        book_donor,
        book_shelf_loc_id,
        copiesToRemove,
        copiesToAdd,
        book_cover,
      } = req.body;

      if (req.file && req.file.buffer) {
        book_cover = req.file.buffer;
      }

      if (typeof copiesToRemove === 'string') {
        try {
          copiesToRemove = JSON.parse(copiesToRemove);
        } catch (e) {
          copiesToRemove = [];
        }
      }
      
      if (typeof copiesToAdd === 'string') {
        copiesToAdd = parseInt(copiesToAdd) || 0;
      }

    const [booksCheck] = await pool.execute(
      "SELECT * FROM books WHERE batch_registration_key = ?",
      [batchRegistrationKey]
    );

    if (booksCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Books not found for the given batch registration key",
      });
    }

    const existing = booksCheck[0];

    let genreId = existing.book_genre_id;
    if (genre !== undefined && genre !== null) {
      await pool.execute(
        "UPDATE book_genre SET book_genre = ? WHERE book_genre_id = ?",
        [genre, genreId]
      );
    }

    let publisherId = existing.book_publisher_id;
    if (publisher !== undefined && publisher !== null) {
      await pool.execute(
        "UPDATE book_publisher SET publisher = ? WHERE book_publisher_id = ?",
        [publisher, publisherId]
      );
    }

    let authorId = existing.book_author_id;
    if (author !== undefined && author !== null) {
      await pool.execute(
        "UPDATE book_author SET book_author = ? WHERE book_author_id = ?",
        [author, authorId]
      );
    }

    const updateFields = [];
    const updateValues = [];

    if (book_title !== undefined && book_title !== null) {
      updateFields.push("book_title = ?");
      updateValues.push(book_title);
    }
    if (book_cover !== undefined && book_cover !== null) {
      updateFields.push("book_cover = ?");
      updateValues.push(book_cover);
    }
    if (book_edition !== undefined && book_edition !== null) {
      updateFields.push("book_edition = ?");
      updateValues.push(book_edition);
    }
    if (book_year !== undefined && book_year !== null) {
      updateFields.push("book_year = ?");
      updateValues.push(book_year);
    }
    if (book_price !== undefined && book_price !== null) {
      updateFields.push("book_price = ?");
      updateValues.push(book_price);
    }
    if (book_donor !== undefined && book_donor !== null) {
      updateFields.push("book_donor = ?");
      updateValues.push(book_donor);
    }
    if (book_shelf_loc_id !== undefined && book_shelf_loc_id !== null) {
      updateFields.push("book_shelf_location_id = ?");
      updateValues.push(book_shelf_loc_id);
    }

    if (updateFields.length > 0) {
      updateValues.push(batchRegistrationKey);
      const updateQuery = `UPDATE books SET ${updateFields.join(", ")} WHERE batch_registration_key = ?`;
      await pool.execute(updateQuery, updateValues);
    }

    if (copiesToRemove && copiesToRemove.length > 0) {
      const placeholders = copiesToRemove.map(() => '?').join(',');
      await pool.execute(
        `UPDATE books SET status = 'Removed' WHERE book_id IN (${placeholders})`,
        copiesToRemove
      );
    }

    if (copiesToAdd && copiesToAdd > 0) {
      const [maxNumberResult] = await pool.execute(
        "SELECT MAX(book_number) as max_number FROM books WHERE batch_registration_key = ?",
        [batchRegistrationKey]
      );
      
      const startingNumber = (maxNumberResult[0].max_number || 0) + 1;
      const now = new Date();

      for (let i = 0; i < copiesToAdd; i++) {
        const bookNumber = startingNumber + i;
        
        const [bookResult] = await pool.execute(
          `INSERT INTO books (
            book_title, book_cover, book_number, book_qr, book_edition, book_year, book_price, book_donor,
            book_genre_id, book_publisher_id, book_shelf_location_id, book_author_id, batch_registration_key, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            book_title || existing.book_title,
            book_cover || existing.book_cover,
            bookNumber,
            null,
            book_edition || existing.book_edition,
            book_year || existing.book_year,
            book_price || existing.book_price,
            book_donor || existing.book_donor,
            genreId,
            publisherId,
            book_shelf_loc_id || existing.book_shelf_location_id,
            authorId,
            batchRegistrationKey,
            now,
          ]
        );
        
        const insertedBookId = bookResult.insertId;

        const qrData = `BookID:${insertedBookId}-No:${bookNumber}`;
        const qrCodeBuffer = await QRCode.toBuffer(qrData);

        await pool.execute("UPDATE books SET book_qr = ? WHERE book_id = ?", [
          qrCodeBuffer,
          insertedBookId,
        ]);
      }
    }

    res.status(200).json({
      success: true,
      message: "Books updated successfully",
      data: {
        batchRegistrationKey,
        genreId,
        publisherId,
        authorId,
        shelfLocationId: book_shelf_loc_id || existing.book_shelf_location_id,
        copiesToRemove: copiesToRemove ? copiesToRemove.length : 0,
        copiesToAdd: copiesToAdd || 0,
      },
    });
  } catch (error) {
    console.error("Error updating books:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update books",
      error: error.message,
    });
  }
  });
});

// DELETE BOOKS BY BATCH REGISTRATION KEY ROUTE
router.delete('/:batch_registration_key', async (req, res) => {
  try {
    const batchRegistrationKey = req.params.batch_registration_key;

    const [books] = await pool.execute(
      'SELECT * FROM books WHERE batch_registration_key = ?',
      [batchRegistrationKey]
    );

    if (books.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No books found for the given batch registration key',
      });
    }

    await pool.execute(
      'DELETE FROM books WHERE batch_registration_key = ?',
      [batchRegistrationKey]
    );

    res.status(200).json({
      success: true,
      message: 'Books deleted successfully',
      data: {
        batchRegistrationKey,
        deletedCount: books.length,
      },
    });
  } catch (error) {
    console.error('Error deleting books:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete books',
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
        bs.shelf_number,
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

    if (book.book_cover && Buffer.isBuffer(book.book_cover)) {
      book.book_cover = book.book_cover.toString('base64');
    }

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
