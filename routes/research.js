const express = require('express');
const router = express.Router();

// Mock data for research papers
let researchPapers = [
  {
    id: 1,
    type: "Research Paper",
    title: "Machine Learning Applications in Library Management Systems",
    author: "Dr. Maria Santos, John Cruz",
    department: "Computer Science",
    year: 2023,
    shelf: "R1",
    abstract: "This research explores the integration of machine learning algorithms in modern library management systems to improve book recommendation, inventory management, and user experience.",
    quantity: 2,
    genre: "Computer Science",
    price: 0,
    publisher: "",
    edition: "",
    donor: "",
    cover: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// GET /api/research - Get all research papers
router.get('/', (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    let filteredResearch = [...researchPapers];

    // Search functionality
    if (search) {
      const searchLower = search.toLowerCase();
      filteredResearch = filteredResearch.filter(paper =>
        paper.title.toLowerCase().includes(searchLower) ||
        paper.author.toLowerCase().includes(searchLower) ||
        paper.department.toLowerCase().includes(searchLower) ||
        paper.abstract.toLowerCase().includes(searchLower)
      );
    }

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedResearch = filteredResearch.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: paginatedResearch,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: filteredResearch.length,
        totalPages: Math.ceil(filteredResearch.length / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch research papers',
      message: error.message
    });
  }
});

// GET /api/research/:id - Get a specific research paper
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const paper = researchPapers.find(p => p.id === parseInt(id));

    if (!paper) {
      return res.status(404).json({
        success: false,
        error: 'Research paper not found',
        message: `Research paper with ID ${id} does not exist`
      });
    }

    res.json({
      success: true,
      data: paper
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch research paper',
      message: error.message
    });
  }
});

// POST /api/research - Create a new research paper
router.post('/', (req, res) => {
  try {
    const {
      type = "Research Paper",
      title,
      author,
      department,
      year,
      shelf,
      abstract
    } = req.body;

    // Validation
    if (!title || !author) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: 'Title and author are required fields'
      });
    }

    const newPaper = {
      id: researchPapers.length > 0 ? Math.max(...researchPapers.map(p => p.id)) + 1 : 1,
      type,
      title,
      author,
      department: department || "",
      year: year ? parseInt(year) : null,
      shelf: shelf || "",
      abstract: abstract || "",
      quantity: 1,
      genre: department || "",
      price: 0,
      publisher: "",
      edition: "",
      donor: "",
      cover: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    researchPapers.push(newPaper);

    res.status(201).json({
      success: true,
      data: newPaper,
      message: 'Research paper created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create research paper',
      message: error.message
    });
  }
});

// PUT /api/research/:id - Update a research paper
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const paperIndex = researchPapers.findIndex(p => p.id === parseInt(id));

    if (paperIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Research paper not found',
        message: `Research paper with ID ${id} does not exist`
      });
    }

    // Update research paper with new data
    const updatedPaper = {
      ...researchPapers[paperIndex],
      ...req.body,
      id: parseInt(id), // Ensure ID doesn't change
      updatedAt: new Date().toISOString()
    };

    researchPapers[paperIndex] = updatedPaper;

    res.json({
      success: true,
      data: updatedPaper,
      message: 'Research paper updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update research paper',
      message: error.message
    });
  }
});

// DELETE /api/research/:id - Delete a research paper
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const paperIndex = researchPapers.findIndex(p => p.id === parseInt(id));

    if (paperIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Research paper not found',
        message: `Research paper with ID ${id} does not exist`
      });
    }

    const deletedPaper = researchPapers.splice(paperIndex, 1)[0];

    res.json({
      success: true,
      data: deletedPaper,
      message: 'Research paper deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete research paper',
      message: error.message
    });
  }
});

// DELETE /api/research - Delete multiple research papers
router.delete('/', (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: 'Array of IDs is required'
      });
    }

    const deletedPapers = [];
    ids.forEach(id => {
      const paperIndex = researchPapers.findIndex(p => p.id === parseInt(id));
      if (paperIndex !== -1) {
        deletedPapers.push(researchPapers.splice(paperIndex, 1)[0]);
      }
    });

    res.json({
      success: true,
      data: deletedPapers,
      message: `${deletedPapers.length} research paper(s) deleted successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete research papers',
      message: error.message
    });
  }
});

module.exports = router;
