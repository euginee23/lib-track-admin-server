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
        b.isUsingDepartment,
        CASE 
          WHEN b.isUsingDepartment = 1 THEN d.department_id 
          ELSE bg.book_genre_id 
        END AS genre_id,
        CASE 
          WHEN b.isUsingDepartment = 1 THEN d.department_name 
          ELSE bg.book_genre 
        END AS genre,
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
      LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
      LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
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
        b.batch_registration_key,
        b.isUsingDepartment,
        CASE 
          WHEN b.isUsingDepartment = 1 THEN d.department_id 
          ELSE bg.book_genre_id 
        END AS genre_id,
        CASE 
          WHEN b.isUsingDepartment = 1 THEN d.department_name 
          ELSE bg.book_genre 
        END AS genre,
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
      LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
      LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
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

// GET BOOK BY BOOK ID ROUTE
router.get("/book/:book_id", async (req, res) => {
  try {
    const { book_id } = req.params;

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
        b.isUsingDepartment,
        CASE 
          WHEN b.isUsingDepartment = 1 THEN d.department_id 
          ELSE bg.book_genre_id 
        END AS genre_id,
        CASE 
          WHEN b.isUsingDepartment = 1 THEN d.department_name 
          ELSE bg.book_genre 
        END AS genre,
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
      LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
      LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
      LEFT JOIN book_publisher bp ON b.book_publisher_id = bp.book_publisher_id
      LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
      LEFT JOIN book_shelf_location bs ON b.book_shelf_location_id = bs.book_shelf_loc_id
      WHERE b.book_id = ?
      LIMIT 1
    `,
      [book_id]
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
    console.error("Error fetching book by ID:", error);
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
        department,
        useDepartmentInstead,
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
      const isUsingDepartment = useDepartmentInstead === 'true' || useDepartmentInstead === true;
      const categoryValue = isUsingDepartment ? department : genre;
      
      if (!categoryValue || !publisher || !author || !bookShelfLocId) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
          error:
            `${isUsingDepartment ? 'department' : 'genre'}, publisher, author, and bookShelfLocId are required and cannot be null.`,
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

      // GENRE OR DEPARTMENT
      let categoryId;
      if (isUsingDepartment) {
        // Use the department ID directly (it should already exist)
        categoryId = safe(department);
      } else {
        // Create new genre entry
        const [genreResult] = await pool.execute(
          "INSERT INTO book_genre (book_genre, created_at) VALUES (?, ?)",
          [safe(genre), new Date()]
        );
        categoryId = genreResult.insertId;
      }

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
            book_genre_id, book_publisher_id, book_shelf_location_id, book_author_id, batch_registration_key, isUsingDepartment, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            safe(bookTitle),
            safe(req.file.buffer),
            i,
            null,
            safe(bookEdition),
            safe(bookYear),
            safe(bookPrice),
            safe(bookDonor),
            categoryId,
            publisherId,
            shelfLocationId,
            authorId,
            batchRegistrationKey,
            isUsingDepartment ? 1 : 0,
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
          categoryId,
          publisherId,
          authorId,
          shelfLocationId,
          batchRegistrationKey,
          quantity: qtyNumber,
          isUsingDepartment,
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
        department,
        useDepartmentInstead,
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

      console.log('Received update data:', {
        department,
        useDepartmentInstead,
        genre,
        departmentType: typeof department,
        useDepartmentInsteadType: typeof useDepartmentInstead
      });

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
    const isUsingDepartment = useDepartmentInstead === 'true' || useDepartmentInstead === true;
    
    let categoryId = existing.book_genre_id;
    let shouldUpdateCategory = false;
    let shouldUpdateIsUsingDepartment = false;
    
    // Handle genre/department changes
    if (isUsingDepartment) {
      if (department !== undefined && department !== null) {
        const newDepartmentId = parseInt(department);
        const existingDepartmentId = parseInt(existing.book_genre_id);
        console.log(`Department update: existing=${existingDepartmentId}, new=${newDepartmentId}, isUsingDept=${existing.isUsingDepartment}, types: existing=${typeof existingDepartmentId}, new=${typeof newDepartmentId}`);
        // Check if we're switching from genre to department OR changing to a different department
        if (existing.isUsingDepartment === 0 || existingDepartmentId !== newDepartmentId) {
          categoryId = newDepartmentId; // Use department ID directly
          shouldUpdateCategory = true;
          console.log(`Will update category to department ID: ${newDepartmentId}`);
          // Only update the isUsingDepartment flag if we're switching from genre to department
          if (existing.isUsingDepartment === 0) {
            shouldUpdateIsUsingDepartment = true;
            console.log('Switching from genre to department');
          } else {
            console.log('Changing from one department to another');
          }
        } else {
          console.log('No department change needed - same department ID');
        }
      }
    } else {
      if (genre !== undefined && genre !== null) {
        console.log(`Genre update: existing=${existing.book_genre_id}, new=${genre}, isUsingDept=${existing.isUsingDepartment}`);
        // Update existing genre or create new one based on current state
        if (existing.isUsingDepartment === 1) {
          // Was using department, now switching to genre - create new genre
          const [genreResult] = await pool.execute(
            "INSERT INTO book_genre (book_genre, created_at) VALUES (?, ?)",
            [genre, new Date()]
          );
          categoryId = genreResult.insertId;
          shouldUpdateCategory = true;
          shouldUpdateIsUsingDepartment = true;
          console.log(`Switching from department to genre, created new genre ID: ${categoryId}`);
        } else {
          // Was using genre, update existing genre
          await pool.execute(
            "UPDATE book_genre SET book_genre = ? WHERE book_genre_id = ?",
            [genre, categoryId]
          );
          shouldUpdateCategory = true;
          console.log(`Updated existing genre ID ${categoryId} with new name: ${genre}`);
        }
      }
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
    if (shouldUpdateCategory) {
      updateFields.push("book_genre_id = ?");
      updateValues.push(categoryId);
    }
    if (shouldUpdateIsUsingDepartment) {
      updateFields.push("isUsingDepartment = ?");
      updateValues.push(isUsingDepartment ? 1 : 0);
    }

    if (updateFields.length > 0) {
      updateValues.push(batchRegistrationKey);
      const updateQuery = `UPDATE books SET ${updateFields.join(", ")} WHERE batch_registration_key = ?`;
      console.log('Update query:', updateQuery);
      console.log('Update values:', updateValues);
      await pool.execute(updateQuery, updateValues);
    } else {
      console.log('No fields to update');
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
            book_genre_id, book_publisher_id, book_shelf_location_id, book_author_id, batch_registration_key, isUsingDepartment, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            book_title || existing.book_title,
            book_cover || existing.book_cover,
            bookNumber,
            null,
            book_edition || existing.book_edition,
            book_year || existing.book_year,
            book_price || existing.book_price,
            book_donor || existing.book_donor,
            categoryId,
            publisherId,
            book_shelf_loc_id || existing.book_shelf_location_id,
            authorId,
            batchRegistrationKey,
            isUsingDepartment ? 1 : 0,
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
        categoryId,
        publisherId,
        authorId,
        shelfLocationId: book_shelf_loc_id || existing.book_shelf_location_id,
        copiesToRemove: copiesToRemove ? copiesToRemove.length : 0,
        copiesToAdd: copiesToAdd || 0,
        isUsingDepartment,
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



module.exports = router;
