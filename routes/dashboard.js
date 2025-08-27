const express = require('express');
const router = express.Router();

// Mock function to get books and research papers
const getAllItems = () => {
  const books = require('./books');
  const research = require('./research');
  // In a real app, you'd query your database here
  // For now, we'll simulate data
  return {
    books: [
      { id: 1, type: "Book", title: "The Great Gatsby", author: "F. Scott Fitzgerald", genre: "Fiction", year: 1925, quantity: 5, shelf: "A1", price: 899.99 },
      { id: 2, type: "Book", title: "To Kill a Mockingbird", author: "Harper Lee", genre: "Fiction", year: 1960, quantity: 3, shelf: "A2", price: 750.00 }
    ],
    research: [
      { id: 1, type: "Research Paper", title: "Machine Learning Applications", author: "Dr. Maria Santos", department: "Computer Science", year: 2023, quantity: 2, shelf: "R1" }
    ]
  };
};

// GET /api/dashboard/stats - Get dashboard statistics
router.get('/stats', (req, res) => {
  try {
    const data = getAllItems();
    const allItems = [...data.books, ...data.research];

    // Calculate statistics
    const totalBooks = data.books.length;
    const totalResearch = data.research.length;
    const totalItems = allItems.length;
    const totalCopies = allItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalValue = data.books.reduce((sum, book) => sum + (book.price || 0), 0);

    // Books by genre
    const genreStats = data.books.reduce((acc, book) => {
      const genre = book.genre || 'Unknown';
      acc[genre] = (acc[genre] || 0) + 1;
      return acc;
    }, {});

    // Research by department
    const departmentStats = data.research.reduce((acc, paper) => {
      const dept = paper.department || 'Unknown';
      acc[dept] = (acc[dept] || 0) + 1;
      return acc;
    }, {});

    // Recent additions (last 30 days simulation)
    const recentItems = allItems.slice(-5); // Get last 5 items as "recent"

    // Items by year
    const yearStats = allItems.reduce((acc, item) => {
      const year = item.year || 'Unknown';
      acc[year] = (acc[year] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        overview: {
          totalBooks,
          totalResearch,
          totalItems,
          totalCopies,
          totalValue: totalValue.toFixed(2)
        },
        distribution: {
          byType: {
            books: totalBooks,
            research: totalResearch
          },
          byGenre: genreStats,
          byDepartment: departmentStats,
          byYear: yearStats
        },
        recent: recentItems.map(item => ({
          id: item.id,
          type: item.type,
          title: item.title,
          author: item.author,
          addedDate: new Date().toISOString() // Simulated
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard statistics',
      message: error.message
    });
  }
});

// GET /api/dashboard/summary - Get summary data for dashboard cards
router.get('/summary', (req, res) => {
  try {
    const data = getAllItems();
    const allItems = [...data.books, ...data.research];

    const summary = {
      totalCollection: allItems.length,
      totalBooks: data.books.length,
      totalResearch: data.research.length,
      totalCopies: allItems.reduce((sum, item) => sum + (item.quantity || 0), 0),
      totalValue: data.books.reduce((sum, book) => sum + (book.price || 0), 0),
      availableItems: allItems.filter(item => (item.quantity || 0) > 0).length,
      recentlyAdded: allItems.slice(-10).length // Last 10 items
    };

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard summary',
      message: error.message
    });
  }
});

// GET /api/dashboard/charts - Get data for dashboard charts
router.get('/charts', (req, res) => {
  try {
    const data = getAllItems();
    const allItems = [...data.books, ...data.research];

    // Monthly additions (simulated data)
    const monthlyData = [
      { month: 'Jan', books: 5, research: 2 },
      { month: 'Feb', books: 8, research: 3 },
      { month: 'Mar', books: 12, research: 4 },
      { month: 'Apr', books: 6, research: 1 },
      { month: 'May', books: 9, research: 5 },
      { month: 'Jun', books: 11, research: 3 }
    ];

    // Genre distribution
    const genreData = data.books.reduce((acc, book) => {
      const genre = book.genre || 'Unknown';
      const existing = acc.find(item => item.name === genre);
      if (existing) {
        existing.value += 1;
      } else {
        acc.push({ name: genre, value: 1 });
      }
      return acc;
    }, []);

    // Department distribution
    const departmentData = data.research.reduce((acc, paper) => {
      const dept = paper.department || 'Unknown';
      const existing = acc.find(item => item.name === dept);
      if (existing) {
        existing.value += 1;
      } else {
        acc.push({ name: dept, value: 1 });
      }
      return acc;
    }, []);

    res.json({
      success: true,
      data: {
        monthlyAdditions: monthlyData,
        genreDistribution: genreData,
        departmentDistribution: departmentData,
        typeDistribution: [
          { name: 'Books', value: data.books.length },
          { name: 'Research Papers', value: data.research.length }
        ]
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard charts data',
      message: error.message
    });
  }
});

module.exports = router;
