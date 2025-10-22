const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// UNIFIED QR CODE SCAN ROUTE
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

    // Check if it's a book QR code pattern: BookID:xxx-No:xxx
    const bookQrPattern = /^BookID:(\d+)-No:(\d+)$/;
    const bookMatch = qrData.match(bookQrPattern);

    // Check if it's a research paper QR code pattern: ResearchPaperID:xxx
    const researchQrPattern = /^ResearchPaperID:(\d+)$/;
    const researchMatch = qrData.match(researchQrPattern);

    if (bookMatch) {
      // Handle book scanning
      return await scanBook(bookMatch, res);
    } else if (researchMatch) {
      // Handle research paper scanning
      return await scanResearchPaper(researchMatch, res);
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid QR code format",
        error: "QR code does not match any expected format (BookID:xxx-No:xxx or ResearchPaperID:xxx)",
      });
    }
  } catch (error) {
    console.error("Error scanning QR code:", error);
    res.status(500).json({
      success: false,
      message: "Failed to scan QR code",
      error: error.message,
    });
  }
});

// Helper function to scan books
async function scanBook(match, res) {
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
      b.status,
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
      b.created_at
    FROM books b
    LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
    LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
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

  // Convert binary data to base64 strings
  if (book.book_cover && Buffer.isBuffer(book.book_cover)) {
    book.book_cover = book.book_cover.toString('base64');
  }

  if (book.book_qr && Buffer.isBuffer(book.book_qr)) {
    book.book_qr = book.book_qr.toString('base64');
  }

  return res.status(200).json({
    success: true,
    message: "Book found successfully",
    type: "book",
    data: {
      book,
      qrInfo: {
        bookId,
        bookNumber,
        scannedAt: new Date().toISOString(),
      },
    },
  });
}

// Helper function to scan research papers
async function scanResearchPaper(match, res) {
  const researchPaperId = parseInt(match[1]);

  const [papers] = await pool.execute(`
    SELECT 
      rp.research_paper_id,
      rp.research_title,
      rp.year_publication,
      rp.research_abstract,
      rp.research_paper_price,
      rp.research_paper_qr,
      rp.created_at,
      rp.department_id,
      d.department_name,
      GROUP_CONCAT(ra.author_name) AS authors,
      bs.book_shelf_loc_id,
      bs.shelf_number,
      bs.shelf_column,
      bs.shelf_row
    FROM research_papers rp
    LEFT JOIN departments d ON rp.department_id = d.department_id
    LEFT JOIN research_author ra ON rp.research_paper_id = ra.research_paper_id
    LEFT JOIN book_shelf_location bs ON rp.book_shelf_loc_id = bs.book_shelf_loc_id
    WHERE rp.research_paper_id = ?
    GROUP BY rp.research_paper_id
    LIMIT 1
  `, [researchPaperId]);

  if (papers.length === 0) {
    return res.status(404).json({
      success: false,
      message: "Research paper not found",
      error: "No research paper found matching the scanned QR code",
    });
  }

  const paper = papers[0];

  // Convert binary data to base64 string
  if (paper.research_paper_qr && Buffer.isBuffer(paper.research_paper_qr)) {
    paper.research_paper_qr = paper.research_paper_qr.toString('base64');
  }

  return res.status(200).json({
    success: true,
    message: "Research paper found successfully",
    type: "research_paper",
    data: {
      researchPaper: paper,
      qrInfo: {
        researchPaperId,
        scannedAt: new Date().toISOString(),
      },
    },
  });
}

module.exports = router;