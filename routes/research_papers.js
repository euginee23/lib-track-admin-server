const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const QRCode = require('qrcode');

// UNDEFINED VALUE SQL PARAMS HELPER
function safe(val) {
  return val === undefined ? null : val;
}

// GET ALL AUTHORS
router.get('/authors', async (req, res) => {
  try {
    const [authors] = await pool.execute('SELECT * FROM research_author ORDER BY author_name');
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

// GET ALL DEPARTMENTS
router.get('/departments', async (req, res) => {
  try {
    const [departments] = await pool.execute('SELECT * FROM departments ORDER BY department_name');
    res.status(200).json({
      success: true,
      count: departments.length,
      data: departments
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch departments',
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

// GET ALL RESEARCH PAPERS
router.get('/', async (req, res) => {
  try {
    const [papers] = await pool.execute(`
      SELECT 
        rp.research_paper_id,
        rp.research_title,
        rp.year_publication,
        rp.research_abstract,
        rp.created_at,
        d.department_name,
        GROUP_CONCAT(ra.author_name) AS authors,
        bs.shelf_column,
        bs.shelf_row
      FROM research_papers rp
      LEFT JOIN departments d ON rp.department_id = d.department_id
      LEFT JOIN research_author ra ON rp.research_paper_id = ra.research_paper_id
      LEFT JOIN book_shelf_location bs ON rp.book_shelf_loc_id = bs.book_shelf_loc_id
      GROUP BY rp.research_paper_id
      ORDER BY rp.research_paper_id DESC
    `);

    res.status(200).json({
      success: true,
      count: papers.length,
      data: papers
    });
  } catch (error) {
    console.error('Error fetching research papers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch research papers',
      error: error.message
    });
  }
});

// GET RESEARCH PAPER BY ID
router.get('/:id', async (req, res) => {
  try {
    const [papers] = await pool.execute(`
      SELECT 
        rp.research_paper_id,
        rp.research_title,
        rp.year_publication,
        rp.research_abstract,
        rp.created_at,
        d.department_name,
        GROUP_CONCAT(ra.author_name) AS authors,
        bs.shelf_column,
        bs.shelf_row
      FROM research_papers rp
      LEFT JOIN departments d ON rp.department_id = d.department_id
      LEFT JOIN research_author ra ON rp.research_paper_id = ra.research_paper_id
      LEFT JOIN book_shelf_location bs ON rp.book_shelf_loc_id = bs.book_shelf_loc_id
      WHERE rp.research_paper_id = ?
      GROUP BY rp.research_paper_id
      LIMIT 1
    `, [req.params.id]);

    if (papers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Research paper not found'
      });
    }

    res.status(200).json({
      success: true,
      data: papers[0]
    });
  } catch (error) {
    console.error('Error fetching research paper:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch research paper',
      error: error.message
    });
  }
});

// INSERT RESEARCH PAPER
router.post('/add', async (req, res) => {
  try {
    const {
      researchTitle,
      yearPublication,
      researchAbstract,
      department,
      authors,
      shelfColumn,
      shelfRow
    } = req.body;

    // VALIDATION
    if (!researchTitle || !yearPublication || !department || !authors || authors.length === 0 || !shelfColumn || !shelfRow) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // DEPARTMENT
    const [departmentResult] = await pool.execute(
      'INSERT INTO departments (department_name, created_at) VALUES (?, ?)',
      [safe(department), new Date()]
    );
    const departmentId = departmentResult.insertId;

    // SHELF LOCATION
    const [shelfResult] = await pool.execute(
      'INSERT INTO book_shelf_location (shelf_column, shelf_row, created_at) VALUES (?, ?, ?)',
      [safe(shelfColumn), safe(shelfRow), new Date()]
    );
    const shelfLocationId = shelfResult.insertId;

    // RESEARCH PAPER
    const [paperResult] = await pool.execute(`
      INSERT INTO research_papers (
        research_title,
        year_publication,
        research_abstract,
        department_id,
        book_shelf_loc_id,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      researchTitle,
      yearPublication,
      researchAbstract,
      departmentId,
      shelfLocationId,
      new Date()
    ]);

    const researchPaperId = paperResult.insertId;

    // GENERATE QR CODE
    const qrData = `ResearchPaperID:${researchPaperId}`;
    const qrCodeBuffer = await QRCode.toBuffer(qrData);

    // UPDATE RESEARCH PAPER WITH QR CODE
    await pool.execute(
      'UPDATE research_papers SET research_paper_qr = ? WHERE research_paper_id = ?',
      [qrCodeBuffer, researchPaperId]
    );

    // AUTHORS
    for (const author of authors) {
      await pool.execute(
        'INSERT INTO research_author (research_paper_id, author_name, created_at) VALUES (?, ?, ?)',
        [researchPaperId, safe(author), new Date()]
      );
    }

    res.status(201).json({
      success: true,
      message: 'Research paper added successfully',
      data: { id: researchPaperId }
    });
  } catch (error) {
    console.error('Error adding research paper:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add research paper',
      error: error.message
    });
  }
});

// UPDATE RESEARCH PAPER
router.put('/:id', async (req, res) => {
  try {
    const researchPaperId = req.params.id;
    const {
      researchTitle,
      yearPublication,
      researchAbstract,
      department,
      author,
      shelfColumn,
      shelfRow
    } = req.body;

    // Get the existing research paper to check if it exists
    const [paperCheck] = await pool.execute(
      'SELECT * FROM research_papers WHERE research_paper_id = ?',
      [researchPaperId]
    );

    if (paperCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Research paper not found'
      });
    }

    const existing = paperCheck[0];

    // Update department if provided
    let departmentId = existing.department_id;
    if (department) {
      const [departmentResult] = await pool.execute(
        'UPDATE departments SET department_name = ?, updated_at = ? WHERE department_id = ?',
        [department, new Date(), departmentId]
      );
    }

    // Update author if provided
    let authorId = existing.research_author_id;
    if (author) {
      const [authorResult] = await pool.execute(
        'UPDATE research_author SET author_name = ?, updated_at = ? WHERE research_author_id = ?',
        [author, new Date(), authorId]
      );
    }

    // Update shelf location if provided
    let shelfLocationId = existing.book_shelf_loc_id;
    if (shelfColumn && shelfRow) {
      const [shelfResult] = await pool.execute(
        'UPDATE book_shelf_location SET shelf_column = ?, shelf_row = ?, updated_at = ? WHERE book_shelf_loc_id = ?',
        [shelfColumn, shelfRow, new Date(), shelfLocationId]
      );
    }

    // Update the research paper
    const [result] = await pool.execute(
      `UPDATE research_papers SET 
        research_title = COALESCE(?, research_title),
        year_publication = COALESCE(?, year_publication),
        research_abstract = COALESCE(?, research_abstract),
        updated_at = ?
      WHERE research_paper_id = ?`,
      [
        safe(researchTitle),
        safe(yearPublication),
        safe(researchAbstract),
        new Date(),
        researchPaperId
      ]
    );

    res.status(200).json({
      success: true,
      message: 'Research paper updated successfully',
      data: { 
        researchPaperId,
        departmentId, 
        authorId,
        shelfLocationId
      }
    });
  } catch (error) {
    console.error('Error updating research paper:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update research paper',
      error: error.message
    });
  }
});

// DELETE RESEARCH PAPER
router.delete('/:id', async (req, res) => {
  try {
    const researchPaperId = req.params.id;

    // Get research paper details to find related records
    const [papers] = await pool.execute(
      'SELECT department_id, research_author_id FROM research_papers WHERE research_paper_id = ?',
      [researchPaperId]
    );

    if (papers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Research paper not found'
      });
    }

    const paper = papers[0];

    // Delete the research paper record
    const [result] = await pool.execute(
      'DELETE FROM research_papers WHERE research_paper_id = ?',
      [researchPaperId]
    );

    res.status(200).json({
      success: true,
      message: 'Research paper deleted successfully',
      data: { id: researchPaperId }
    });
  } catch (error) {
    console.error('Error deleting research paper:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete research paper',
      error: error.message
    });
  }
});

module.exports = router;
