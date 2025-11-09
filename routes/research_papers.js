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
    const [locations] = await pool.execute('SELECT * FROM book_shelf_location ORDER BY shelf_number, shelf_column, shelf_row');
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
    const { ids } = req.query;
    
    let whereClause = '';
    let queryParams = [];
    
    if (ids) {
      const idArray = ids.split(',').map(id => id.trim());
      whereClause = 'WHERE rp.research_paper_id IN (' + idArray.map(() => '?').join(',') + ')';
      queryParams = idArray;
    }

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
        bs.shelf_number,
        bs.shelf_column,
        bs.shelf_row
      FROM research_papers rp
      LEFT JOIN departments d ON rp.department_id = d.department_id
      LEFT JOIN research_author ra ON rp.research_paper_id = ra.research_paper_id
      LEFT JOIN book_shelf_location bs ON rp.book_shelf_loc_id = bs.book_shelf_loc_id
      ${whereClause}
      GROUP BY rp.research_paper_id
      ORDER BY rp.research_paper_id DESC
    `, queryParams);

    // Get ratings for all research papers
    const [ratings] = await pool.execute(`
      SELECT 
        r.rating_id,
        r.research_paper_id,
        r.user_id,
        r.star_rating,
        r.comment,
        r.created_at as rating_created_at,
        u.first_name,
        u.last_name
      FROM ratings r
      LEFT JOIN users u ON r.user_id = u.user_id
      WHERE r.research_paper_id IS NOT NULL
      ORDER BY r.created_at DESC
    `);

    // Group ratings by research_paper_id
    const ratingsMap = {};
    ratings.forEach(rating => {
      const key = rating.research_paper_id;
      if (!ratingsMap[key]) {
        ratingsMap[key] = [];
      }
      ratingsMap[key].push({
        rating_id: rating.rating_id,
        user_id: rating.user_id,
        user_name: rating.first_name && rating.last_name 
          ? `${rating.first_name} ${rating.last_name}` 
          : 'Anonymous',
        star_rating: rating.star_rating,
        comment: rating.comment,
        created_at: rating.rating_created_at
      });
    });

    // CONVERT QR CODE BUFFER TO BASE64 STRING and add ratings
    const formattedPapers = papers.map(paper => {
      const paperRatings = ratingsMap[paper.research_paper_id] || [];
      const avgRating = paperRatings.length > 0
        ? paperRatings.reduce((sum, r) => sum + r.star_rating, 0) / paperRatings.length
        : null;

      return {
        ...paper,
        research_paper_qr: paper.research_paper_qr ? paper.research_paper_qr.toString('base64') : null,
        average_rating: avgRating ? parseFloat(avgRating.toFixed(1)) : null,
        total_ratings: paperRatings.length,
        reviews: paperRatings
      };
    });

    res.status(200).json({
      success: true,
      count: formattedPapers.length,
      data: formattedPapers
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
        rp.research_paper_price,
        rp.research_paper_qr,
        rp.created_at,
        rp.department_id,
        d.department_name,
        GROUP_CONCAT(ra.author_name) AS authors,
        bs.shelf_number,
        bs.shelf_column,
        bs.shelf_row,
        rp.status
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

    // Get ratings for this research paper
    const [ratings] = await pool.execute(`
      SELECT 
        r.rating_id,
        r.user_id,
        r.star_rating,
        r.comment,
        r.created_at as rating_created_at,
        u.first_name,
        u.last_name
      FROM ratings r
      LEFT JOIN users u ON r.user_id = u.user_id
      WHERE r.research_paper_id = ?
      ORDER BY r.created_at DESC
    `, [req.params.id]);

    const reviews = ratings.map(rating => ({
      rating_id: rating.rating_id,
      user_id: rating.user_id,
      user_name: rating.first_name && rating.last_name 
        ? `${rating.first_name} ${rating.last_name}` 
        : 'Anonymous',
      star_rating: rating.star_rating,
      comment: rating.comment,
      created_at: rating.rating_created_at
    }));

    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.star_rating, 0) / reviews.length
      : null;

    // CONVERT QR CODE BUFFER TO BASE64 STRING
    const paper = papers[0];
    const formattedPaper = {
      ...paper,
      research_paper_qr: paper.research_paper_qr ? paper.research_paper_qr.toString('base64') : null,
      average_rating: avgRating ? parseFloat(avgRating.toFixed(1)) : null,
      total_ratings: reviews.length,
      reviews: reviews
    };

    res.status(200).json({
      success: true,
      data: formattedPaper
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
      departmentId,
      authors,
      shelfLocationId,
      price
    } = req.body;

    // VALIDATION
    if (!researchTitle || !yearPublication || !departmentId || !authors || authors.length === 0 || !shelfLocationId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Now using the provided departmentId directly instead of creating a new department

    // RESEARCH PAPER
    const [paperResult] = await pool.execute(`
      INSERT INTO research_papers (
        research_title,
        year_publication,
        research_abstract,
        department_id,
        book_shelf_loc_id,
        research_paper_price,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      researchTitle,
      yearPublication,
      researchAbstract,
      departmentId, // Using the provided departmentId directly
      shelfLocationId,
      safe(price),
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
    let {
      research_title,
      year_publication,
      research_abstract,
      department_id,
      authors,
      book_shelf_loc_id,
      research_paper_price
    } = req.body;

    // Parse JSON strings from FormData if they exist
    if (typeof authors === 'string') {
      try {
        authors = JSON.parse(authors);
      } catch (e) {
        authors = [];
      }
    }

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

    // Update authors if provided
    if (authors !== undefined && authors !== null && Array.isArray(authors) && authors.length > 0) {
      // Delete existing authors for this research paper
      await pool.execute(
        'DELETE FROM research_author WHERE research_paper_id = ?',
        [researchPaperId]
      );
      
      // Insert new authors
      for (const author of authors) {
        await pool.execute(
          'INSERT INTO research_author (research_paper_id, author_name, created_at) VALUES (?, ?, ?)',
          [researchPaperId, safe(author), new Date()]
        );
      }
    }

    // Build dynamic update query only for changed fields
    const updateFields = [];
    const updateValues = [];

    if (research_title !== undefined && research_title !== null) {
      updateFields.push("research_title = ?");
      updateValues.push(research_title);
    }
    if (year_publication !== undefined && year_publication !== null) {
      updateFields.push("year_publication = ?");
      updateValues.push(year_publication);
    }
    if (research_abstract !== undefined && research_abstract !== null) {
      updateFields.push("research_abstract = ?");
      updateValues.push(research_abstract);
    }
    if (book_shelf_loc_id !== undefined && book_shelf_loc_id !== null) {
      updateFields.push("book_shelf_loc_id = ?");
      updateValues.push(book_shelf_loc_id);
    }
    if (research_paper_price !== undefined && research_paper_price !== null) {
      updateFields.push("research_paper_price = ?");
      updateValues.push(research_paper_price);
    }
    if (department_id !== undefined && department_id !== null) {
      updateFields.push("department_id = ?");
      updateValues.push(department_id);
    }

    // Only update if there are fields to update
    if (updateFields.length > 0) {
      updateValues.push(researchPaperId);
      const updateQuery = `UPDATE research_papers SET ${updateFields.join(", ")} WHERE research_paper_id = ?`;
      await pool.execute(updateQuery, updateValues);
    }

    res.status(200).json({
      success: true,
      message: 'Research paper updated successfully',
      data: { 
        researchPaperId,
        departmentId: department_id || existing.department_id, 
        shelfLocationId: book_shelf_loc_id || existing.book_shelf_loc_id
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

    // Check if research paper exists
    const [papers] = await pool.execute(
      'SELECT research_paper_id FROM research_papers WHERE research_paper_id = ?',
      [researchPaperId]
    );
    if (papers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Research paper not found'
      });
    }

    // Delete authors for this research paper
    await pool.execute(
      'DELETE FROM research_author WHERE research_paper_id = ?',
      [researchPaperId]
    );

    // Delete the research paper record
    await pool.execute(
      'DELETE FROM research_papers WHERE research_paper_id = ?',
      [researchPaperId]
    );

    res.status(200).json({
      success: true,
      message: 'Research paper and its authors deleted successfully',
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
