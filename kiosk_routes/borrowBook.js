const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
require('dotenv').config();

// Get upload domain from environment
const UPLOAD_DOMAIN = (process.env.UPLOAD_DOMAIN || 'https://uploads.codehub.site').replace(/\/+$/, '');
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || 'http://localhost:4000';

// UNDEFINED VALUE SQL PARAMS HELPER
function safe(val) {
  return val === undefined ? null : val;
}

// Helper function to upload receipt image to file system
async function uploadReceiptImage(fileBuffer, filename, mimeType) {
  try {
    const formData = new FormData();
    formData.append('file', fileBuffer, { filename, contentType: mimeType });
    
    const response = await axios.post(`${SERVER_BASE_URL}/api/uploads/receipt`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 30000,
    });
    
    return response.data;
  } catch (error) {
    console.error('Error uploading receipt image:', error);
    throw new Error('Failed to upload receipt image to file system');
  }
}

// BORROW BOOK ROUTE
router.post("/borrow", (req, res) => {
  const upload = req.upload.single("receipt_image");
  upload(req, res, async (err) => {
    if (err) {
      console.error("File upload error:", err);
      let errorMessage = "File upload error";
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        errorMessage = "File size too large. Maximum file size is 30MB.";
      } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        errorMessage = "Unexpected file field. Please upload only the receipt image.";
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
      console.log("Received borrow data:", req.body);
      console.log("Received receipt file:", req.file ? {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      } : null);

      // VALIDATE FILE TYPE IF PROVIDED
      if (req.file) {
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedMimeTypes.includes(req.file.mimetype)) {
          return res.status(400).json({
            success: false,
            message: "Invalid file type",
            error: "Only JPEG, PNG, GIF, and WEBP images are allowed for receipt",
          });
        }

        // VALIDATE FILE SIZE
        if (req.file.size > 30 * 1024 * 1024) {
          return res.status(400).json({
            success: false,
            message: "File too large",
            error: "Receipt image must be less than 30MB",
          });
        }
      }

      const {
        reference_number,
        user_id,
        book_ids,
        research_paper_ids,
        due_date,
        transaction_type = "Borrow"
      } = req.body;

    // VALIDATION
    if (!reference_number || !user_id || (!book_ids && !research_paper_ids)) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
        error: "reference_number, user_id, and either book_ids or research_paper_ids are required"
      });
    }

    // ENSURE ARRAYS FOR CONSISTENCY
    const bookIdsArray = book_ids ? (Array.isArray(book_ids) ? book_ids : [book_ids]) : [];
    const researchPaperIdsArray = research_paper_ids ? (Array.isArray(research_paper_ids) ? research_paper_ids : [research_paper_ids]) : [];

    if (bookIdsArray.length === 0 && researchPaperIdsArray.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No items to borrow",
        error: "At least one book_id or research_paper_id is required"
      });
    }

    // CHECK IF USER EXISTS
    const [userCheck] = await pool.execute(
      "SELECT user_id, librarian_approval FROM users WHERE user_id = ?",
      [user_id]
    );

    if (userCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // CHECK IF USER IS APPROVED
    if (userCheck[0].librarian_approval !== 1) {
      return res.status(403).json({
        success: false,
        message: "User not approved for borrowing"
      });
    }

    // CHECK IF BOOKS EXIST AND ARE AVAILABLE
    const unavailableBooks = [];
    if (bookIdsArray.length > 0) {
      const placeholders = bookIdsArray.map(() => '?').join(',');
      const [bookCheck] = await pool.execute(
        `SELECT book_id, status, book_title FROM books WHERE book_id IN (${placeholders})`,
        bookIdsArray
      );

      if (bookCheck.length !== bookIdsArray.length) {
        const foundIds = bookCheck.map(book => book.book_id);
        const notFoundIds = bookIdsArray.filter(id => !foundIds.includes(parseInt(id)));
        return res.status(404).json({
          success: false,
          message: "Some books not found",
          error: `Book IDs not found: ${notFoundIds.join(', ')}`
        });
      }

      // CHECK AVAILABILITY
      bookCheck.forEach(book => {
        if (book.status !== "Available") {
          unavailableBooks.push({
            id: book.book_id,
            title: book.book_title,
            status: book.status
          });
        }
      });
    }

    // CHECK IF RESEARCH PAPERS EXIST
    if (researchPaperIdsArray.length > 0) {
      const placeholders = researchPaperIdsArray.map(() => '?').join(',');
      const [researchCheck] = await pool.execute(
        `SELECT research_paper_id FROM research_papers WHERE research_paper_id IN (${placeholders})`,
        researchPaperIdsArray
      );

      if (researchCheck.length !== researchPaperIdsArray.length) {
        const foundIds = researchCheck.map(rp => rp.research_paper_id);
        const notFoundIds = researchPaperIdsArray.filter(id => !foundIds.includes(parseInt(id)));
        return res.status(404).json({
          success: false,
          message: "Some research papers not found",
          error: `Research paper IDs not found: ${notFoundIds.join(', ')}`
        });
      }
    }

    // CHECK FOR UNAVAILABLE BOOKS
    if (unavailableBooks.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Some books are not available for borrowing",
        error: "Unavailable books",
        unavailable_books: unavailableBooks
      });
    }

    // CHECK IF REFERENCE NUMBER ALREADY EXISTS
    const [refCheck] = await pool.execute(
      "SELECT reference_number FROM transactions WHERE reference_number = ?",
      [reference_number]
    );

    if (refCheck.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Reference number already exists"
      });
    }

    // HANDLE RECEIPT IMAGE UPLOAD TO VPS
    let receiptImagePath = null;
    if (req.file && req.file.buffer) {
      try {
        // Generate filename using reference number
        const fileExtension = path.extname(req.file.originalname) || '.jpg';
        const receiptFilename = `${reference_number}${fileExtension}`;
        
        console.log(`Uploading receipt image: ${receiptFilename}`);
        const receiptUpload = await uploadReceiptImage(
          req.file.buffer, 
          receiptFilename, 
          req.file.mimetype
        );
        
        console.log('Receipt image uploaded to VPS:', receiptUpload);
        
        // Store the file path for database storage
        receiptImagePath = `/receipts/${receiptFilename}`;
      } catch (uploadError) {
        console.error('Error uploading receipt image:', uploadError);
        // Continue without receipt if upload fails, but log the error
        receiptImagePath = null;
      }
    }

    // INSERT MULTIPLE TRANSACTIONS (ONE FOR EACH ITEM)
    const transactionIds = [];
    const transactionDate = new Date();

    // INSERT TRANSACTIONS FOR BOOKS
    for (const bookId of bookIdsArray) {
      const [transactionResult] = await pool.execute(
        `INSERT INTO transactions (
          reference_number,
          user_id,
          book_id,
          research_paper_id,
          receipt_image,
          due_date,
          transaction_type,
          transaction_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reference_number,
          user_id,
          bookId,
          null,
          receiptImagePath, // Store file path instead of binary data
          safe(due_date),
          transaction_type,
          transactionDate
        ]
      );
      transactionIds.push(transactionResult.insertId);

      // UPDATE BOOK STATUS TO BORROWED
      await pool.execute(
        "UPDATE books SET status = 'Borrowed' WHERE book_id = ?",
        [bookId]
      );
    }

    // INSERT TRANSACTIONS FOR RESEARCH PAPERS
    for (const researchPaperId of researchPaperIdsArray) {
      const [transactionResult] = await pool.execute(
        `INSERT INTO transactions (
          reference_number,
          user_id,
          book_id,
          research_paper_id,
          receipt_image,
          due_date,
          transaction_type,
          transaction_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reference_number,
          user_id,
          null,
          researchPaperId,
          receiptImagePath, // Store file path instead of binary data
          safe(due_date),
          transaction_type,
          transactionDate
        ]
      );
      transactionIds.push(transactionResult.insertId);

      // UPDATE RESEARCH PAPER STATUS TO BORROWED
      await pool.execute(
        "UPDATE research_papers SET status = 'Borrowed' WHERE research_paper_id = ?",
        [researchPaperId]
      );
    }

    const totalItems = bookIdsArray.length + researchPaperIdsArray.length;

    res.status(201).json({
      success: true,
      message: `${totalItems} item(s) borrowed successfully`,
      data: {
        transaction_ids: transactionIds,
        reference_number,
        user_id,
        book_ids: bookIdsArray,
        research_paper_ids: researchPaperIdsArray,
        due_date: safe(due_date),
        transaction_type,
        transaction_date: transactionDate,
        total_items: totalItems,
        has_receipt: !!receiptImagePath,
        receipt_path: receiptImagePath
      }
    });

    } catch (error) {
      console.error("Error borrowing book/research paper:", error);
      res.status(500).json({
        success: false,
        message: "Failed to borrow book/research paper",
        error: error.message
      });
    }
  });
});

module.exports = router;
