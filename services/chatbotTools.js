const { pool } = require('../config/database');

/**
 * Database Tools for Ollama Chatbot
 * These functions can be called by the AI to fetch information from the database
 */

/**
 * Tool Definitions - Format expected by Ollama
 */
const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'search_books',
      description: 'Search for books in the library catalog by title, author, ISBN, or keywords. Returns book details including availability status.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (book title, author name, ISBN, or keywords)'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default: 10)',
            default: 10
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_book_availability',
      description: 'Check the availability and detailed information of a specific book by its ID.',
      parameters: {
        type: 'object',
        properties: {
          book_id: {
            type: 'number',
            description: 'The unique ID of the book'
          }
        },
        required: ['book_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_research_papers',
      description: 'Search for research papers in the library repository by title, author, or keywords.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (paper title, author, or keywords)'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default: 10)',
            default: 10
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recommend_research_papers',
      description: 'Get personalized research paper recommendations based on user department and preferences.',
      parameters: {
        type: 'object',
        properties: {
          user_id: {
            type: 'number',
            description: 'The user ID for personalized recommendations'
          },
          limit: {
            type: 'number',
            description: 'Number of recommendations (default: 5)',
            default: 5
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_faqs',
      description: 'Retrieve frequently asked questions about the library system. Useful for answering common queries about policies, services, and procedures.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Optional category to filter FAQs',
            enum: ['general', 'borrowing', 'returning', 'policies', 'all']
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_library_rules',
      description: 'Get library rules and regulations including borrowing limits, loan periods, and penalties.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_popular_books',
      description: 'Get the most borrowed or highest-rated books in the library.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Type of popularity metric',
            enum: ['most_borrowed', 'highest_rated', 'recently_added']
          },
          limit: {
            type: 'number',
            description: 'Number of books to return (default: 10)',
            default: 10
          }
        },
        required: ['type']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_user_borrowed_books',
      description: 'Get the list of books currently borrowed by a user.',
      parameters: {
        type: 'object',
        properties: {
          user_id: {
            type: 'number',
            description: 'The user ID'
          }
        },
        required: ['user_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_user_transaction_history',
      description: 'Get transaction history for a user including borrowing and return records.',
      parameters: {
        type: 'object',
        properties: {
          user_id: {
            type: 'number',
            description: 'The user ID'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of transactions to return (default: 20)',
            default: 20
          }
        },
        required: ['user_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recommend_books',
      description: 'Get personalized book recommendations based on user reading history and preferences.',
      parameters: {
        type: 'object',
        properties: {
          user_id: {
            type: 'number',
            description: 'The user ID for personalized recommendations'
          },
          category: {
            type: 'string',
            description: 'Optional book category to focus recommendations'
          },
          limit: {
            type: 'number',
            description: 'Number of recommendations (default: 5)',
            default: 5
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_book_categories',
      description: 'Get all available book categories in the library.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  }
];

/**
 * Helper: Normalize and tokenize search query for intelligent matching
 * Handles punctuation, stopwords, and creates multiple search variations
 */
function normalizeSearchQuery(query) {
  if (!query) return { original: '', normalized: '', tokens: [], patterns: [] };
  
  const original = query.trim();
  
  // Remove special characters but preserve spaces and basic punctuation
  const normalized = original
    .toLowerCase()
    .replace(/[_\-:;,\.]/g, ' ')  // Replace separators with spaces
    .replace(/\s+/g, ' ')          // Collapse multiple spaces
    .trim();
  
  // Tokenize into individual words
  const stopwords = new Set(['a', 'an', 'the', 'by', 'of', 'for', 'in', 'on', 'at', 'to', 'from', 'with']);
  const tokens = normalized
    .split(/\s+/)
    .filter(token => token.length >= 2 && !stopwords.has(token));
  
  // Generate search patterns for flexible matching
  const patterns = [
    `%${original}%`,                    // Exact query
    `%${normalized}%`,                  // Normalized query
    `%${normalized.replace(/\s+/g, '%')}%`, // Words in any order with wildcards
    ...tokens.map(t => `%${t}%`)        // Individual tokens
  ];
  
  return { original, normalized, tokens, patterns };
}

/**
 * Helper: Calculate similarity score between two strings (basic Levenshtein-inspired)
 */
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  // Exact match
  if (s1 === s2) return 100;
  
  // One contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 80;
  
  // Check token overlap
  const tokens1 = s1.split(/\s+/);
  const tokens2 = s2.split(/\s+/);
  const overlap = tokens1.filter(t => tokens2.some(t2 => t2.includes(t) || t.includes(t2)));
  
  if (overlap.length > 0) {
    return Math.min(60, overlap.length * 20);
  }
  
  return 0;
}

/**
 * Tool Implementations
 */
const toolImplementations = {
  /**
   * Enhanced book search with intelligent matching
   * Features: fuzzy matching, tokenization, multi-word support, variation handling
   * Searches: title, author, category/genre, publisher, year, department, keywords
   * Supports: partial matches, exact matches, keyword-based matches, word variations
   * Prioritizes: exact > partial > keyword matches, available > unavailable
   */
  search_books: async ({ query, limit = 10 }) => {
    try {
      if (!query || query.trim().length === 0) {
        return { success: false, error: 'Search query is required' };
      }

      const { original, normalized, tokens, patterns } = normalizeSearchQuery(query);
      
      console.log(`🔍 Searching books for: "${original}"`)
      console.log(`   Normalized: "${normalized}"`)
      console.log(`   Tokens: [${tokens.join(', ')}]`);

      // Build dynamic WHERE conditions for intelligent token matching
      const whereConditions = [];
      const scoreConditions = [];
      const params = [];
      
      // Pattern 1: Exact or close match on original query
      whereConditions.push(`(
        LOWER(b.book_title) LIKE ? OR
        LOWER(COALESCE(ba.book_author, '')) LIKE ? OR
        LOWER(COALESCE(bg.book_genre, '')) LIKE ? OR
        LOWER(COALESCE(d.department_name, '')) LIKE ?
      )`);
      params.push(`%${original}%`, `%${original}%`, `%${original}%`, `%${original}%`);
      
      // Pattern 2: Normalized match (handles punctuation variations)
      if (normalized !== original) {
        whereConditions.push(`(
          LOWER(REPLACE(REPLACE(REPLACE(b.book_title, '_', ' '), '-', ' '), ':', ' ')) LIKE ? OR
          LOWER(REPLACE(REPLACE(REPLACE(ba.book_author, '_', ' '), '-', ' '), ',', ' ')) LIKE ?
        )`);
        params.push(`%${normalized}%`, `%${normalized}%`);
      }
      
      // Pattern 3: Token-based matching (all tokens present)
      if (tokens.length > 0) {
        const tokenConditions = tokens.map(() => 
          `(LOWER(b.book_title) LIKE ? OR LOWER(COALESCE(ba.book_author, '')) LIKE ?)`
        ).join(' AND ');
        whereConditions.push(`(${tokenConditions})`);
        tokens.forEach(token => {
          params.push(`%${token}%`, `%${token}%`);
        });
      }
      
      // Comprehensive search with intelligent relevance scoring
      const [books] = await pool.query(
        `SELECT DISTINCT
          b.book_id,
          b.book_title AS title,
          COALESCE(ba.book_author, 'Unknown Author') AS author,
          b.book_number,
          COALESCE(bp.publisher, '') AS publisher,
          b.book_year AS publication_year,
          CASE 
            WHEN b.isUsingDepartment = 1 THEN d.department_name 
            ELSE bg.book_genre 
          END AS category,
          b.book_edition,
          b.status,
          CASE
            WHEN b.status = 'Available' THEN 'Available'
            ELSE 'Not Available'
          END AS availability_status,
          COALESCE(AVG(r.star_rating), 0) as average_rating,
          COUNT(DISTINCT r.rating_id) as rating_count,
          -- Enhanced relevance scoring with fuzzy matching
          (
            -- Exact matches (highest priority)
            CASE WHEN LOWER(b.book_title) = LOWER(?) THEN 100 ELSE 0 END +
            CASE WHEN LOWER(COALESCE(ba.book_author, '')) = LOWER(?) THEN 95 ELSE 0 END +
            
            -- Starts with matches
            CASE WHEN LOWER(b.book_title) LIKE LOWER(?) THEN 60 ELSE 0 END +
            CASE WHEN LOWER(COALESCE(ba.book_author, '')) LIKE LOWER(?) THEN 55 ELSE 0 END +
            
            -- Contains original query
            CASE WHEN LOWER(b.book_title) LIKE LOWER(?) THEN 40 ELSE 0 END +
            CASE WHEN LOWER(COALESCE(ba.book_author, '')) LIKE LOWER(?) THEN 35 ELSE 0 END +
            
            -- Contains normalized query (handles punctuation)
            CASE WHEN LOWER(REPLACE(REPLACE(b.book_title, '_', ' '), '-', ' ')) LIKE LOWER(?) THEN 30 ELSE 0 END +
            CASE WHEN LOWER(REPLACE(REPLACE(ba.book_author, ',', ' '), '.', ' ')) LIKE LOWER(?) THEN 28 ELSE 0 END +
            
            -- Token matching (individual words)
            ${tokens.map(() => 
              `CASE WHEN LOWER(b.book_title) LIKE LOWER(?) THEN 15 ELSE 0 END`
            ).join(' + ')}${tokens.length > 0 ? ' + ' : ''}
            ${tokens.map(() => 
              `CASE WHEN LOWER(COALESCE(ba.book_author, '')) LIKE LOWER(?) THEN 12 ELSE 0 END`
            ).join(' + ')}${tokens.length > 0 ? ' + ' : ''}
            
            -- Category/Department/Genre matches
            CASE WHEN LOWER(COALESCE(bg.book_genre, '')) LIKE LOWER(?) THEN 25 ELSE 0 END +
            CASE WHEN LOWER(COALESCE(d.department_name, '')) LIKE LOWER(?) THEN 25 ELSE 0 END +
            
            -- Publisher, year, book number
            CASE WHEN LOWER(COALESCE(bp.publisher, '')) LIKE LOWER(?) THEN 18 ELSE 0 END +
            CASE WHEN b.book_number LIKE ? THEN 45 ELSE 0 END +
            CASE WHEN CAST(b.book_year AS CHAR) LIKE ? THEN 10 ELSE 0 END +
            
            -- Availability bonus
            CASE WHEN b.status = 'Available' THEN 8 ELSE 0 END
          ) AS relevance_score
        FROM books b
        LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
        LEFT JOIN book_publisher bp ON b.book_publisher_id = bp.book_publisher_id
        LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
        LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
        LEFT JOIN ratings r ON b.book_id = r.book_id
        WHERE ${whereConditions.join(' OR ')}
        GROUP BY b.book_id, b.book_title, ba.book_author, b.book_number, 
                 bp.publisher, b.book_year, category, b.book_edition, b.status
        HAVING relevance_score > 0
        ORDER BY 
          relevance_score DESC,
          average_rating DESC,
          CASE WHEN b.status = 'Available' THEN 0 ELSE 1 END,
          b.book_title ASC
        LIMIT ?`,
        [
          ...params, // WHERE clause params
          // Relevance score parameters
          original, original, // exact matches
          `${original}%`, `${original}%`, // starts with
          `%${original}%`, `%${original}%`, // contains original
          `%${normalized}%`, `%${normalized}%`, // normalized
          ...tokens.map(t => `%${t}%`), // title tokens
          ...tokens.map(t => `%${t}%`), // author tokens
          `%${original}%`, `%${original}%`, // genre, department
          `%${original}%`, `%${original}%`, `%${original}%`, // publisher, book_number, year
          parseInt(limit)
        ]
      );

      console.log(`✅ Found ${books.length} books matching "${original}"`);
      
      return {
        success: true,
        count: books.length,
        books: books,
        query: original
      };
    } catch (error) {
      console.error('Error searching books:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get detailed book availability
   */
  get_book_availability: async ({ book_id }) => {
    try {
      const [books] = await pool.query(
        `SELECT 
          b.book_id,
          b.book_title,
          b.book_number,
          b.batch_registration_key,
          b.status,
          ba.book_author AS author,
          bp.publisher,
          b.book_year,
          b.book_edition,
          CASE 
            WHEN b.isUsingDepartment = 1 THEN d.department_name 
            ELSE bg.book_genre 
          END AS category,
          CASE 
            WHEN b.status = 'Available' THEN 'Available'
            ELSE 'Not Available'
          END as availability_status,
          (SELECT AVG(star_rating) FROM ratings WHERE book_id = b.book_id) as average_rating,
          (SELECT COUNT(*) FROM ratings WHERE book_id = b.book_id) as rating_count
        FROM books b
        LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
        LEFT JOIN book_publisher bp ON b.book_publisher_id = bp.book_publisher_id
        LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
        LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
        WHERE b.book_id = ?`,
        [book_id]
      );

      if (books.length === 0) {
        return { success: false, error: 'Book not found' };
      }

      return {
        success: true,
        book: books[0]
      };
    } catch (error) {
      console.error('Error getting book availability:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Enhanced research paper search with intelligent matching
   * Features: fuzzy matching, tokenization, multi-word support, variation handling
   * Searches: title, authors, abstract, keywords, department, publication year
   * Supports: partial matches, exact matches, keyword-based matches, word variations
   * Prioritizes: exact > partial > keyword matches, available > unavailable
   */
  search_research_papers: async ({ query, limit = 10 }) => {
    try {
      if (!query || query.trim().length === 0) {
        return { success: false, error: 'Search query is required' };
      }

      const { original, normalized, tokens, patterns } = normalizeSearchQuery(query);
      
      console.log(`🔎 Searching research papers for: "${original}"`);
      console.log(`   Normalized: "${normalized}"`);
      console.log(`   Tokens: [${tokens.join(', ')}]`);

      // Build dynamic WHERE conditions for intelligent token matching
      const whereConditions = [];
      const params = [];
      
      // Pattern 1: Exact or close match on original query
      whereConditions.push(`(
        LOWER(rp.research_title) LIKE ? OR
        LOWER(COALESCE(rp.research_abstract, '')) LIKE ? OR
        LOWER(COALESCE(d.department_name, '')) LIKE ? OR
        EXISTS(
          SELECT 1 FROM research_author ra_where
          WHERE ra_where.research_paper_id = rp.research_paper_id
          AND LOWER(ra_where.author_name) LIKE ?
        )
      )`);
      params.push(`%${original}%`, `%${original}%`, `%${original}%`, `%${original}%`);
      
      // Pattern 2: Normalized match (handles punctuation variations)
      if (normalized !== original) {
        whereConditions.push(`(
          LOWER(REPLACE(REPLACE(REPLACE(rp.research_title, '_', ' '), '-', ' '), ':', ' ')) LIKE ? OR
          LOWER(REPLACE(REPLACE(rp.research_abstract, '_', ' '), '-', ' ')) LIKE ?
        )`);
        params.push(`%${normalized}%`, `%${normalized}%`);
      }
      
      // Pattern 3: Token-based matching (all tokens present)
      if (tokens.length > 0) {
        const tokenConditions = tokens.map(() => 
          `(LOWER(rp.research_title) LIKE ? OR LOWER(COALESCE(rp.research_abstract, '')) LIKE ?)`
        ).join(' AND ');
        whereConditions.push(`(${tokenConditions})`);
        tokens.forEach(token => {
          params.push(`%${token}%`, `%${token}%`);
        });
      }

      // Comprehensive search with intelligent relevance scoring
      const [papers] = await pool.query(
        `SELECT DISTINCT
          rp.research_paper_id,
          rp.research_title AS title,
          GROUP_CONCAT(DISTINCT ra.author_name SEPARATOR ', ') AS author,
          rp.research_abstract AS abstract,
          rp.year_publication AS publication_year,
          d.department_name AS category,
          rp.status,
          CASE 
            WHEN rp.status = 'Available' THEN 'Available'
            ELSE 'Not Available'
          END as availability_status,
          COALESCE(AVG(r.star_rating), 0) as average_rating,
          COUNT(DISTINCT r.rating_id) as rating_count,
          -- Enhanced relevance scoring with fuzzy matching
          (
            -- Exact matches (highest priority)
            CASE WHEN LOWER(rp.research_title) = LOWER(?) THEN 100 ELSE 0 END +
            
            -- Starts with matches
            CASE WHEN LOWER(rp.research_title) LIKE LOWER(?) THEN 60 ELSE 0 END +
            
            -- Contains original query
            CASE WHEN LOWER(rp.research_title) LIKE LOWER(?) THEN 40 ELSE 0 END +
            CASE WHEN LOWER(COALESCE(rp.research_abstract, '')) LIKE LOWER(?) THEN 30 ELSE 0 END +
            
            -- Contains normalized query (handles punctuation)
            CASE WHEN LOWER(REPLACE(REPLACE(rp.research_title, '_', ' '), '-', ' ')) LIKE LOWER(?) THEN 35 ELSE 0 END +
            CASE WHEN LOWER(REPLACE(REPLACE(rp.research_abstract, '_', ' '), '-', ' ')) LIKE LOWER(?) THEN 25 ELSE 0 END +
            
            -- Author matching (original and normalized)
            CASE WHEN EXISTS(
              SELECT 1 FROM research_author ra_exact
              WHERE ra_exact.research_paper_id = rp.research_paper_id
              AND LOWER(ra_exact.author_name) = LOWER(?)
            ) THEN 85 ELSE 0 END +
            CASE WHEN EXISTS(
              SELECT 1 FROM research_author ra_contains
              WHERE ra_contains.research_paper_id = rp.research_paper_id
              AND LOWER(ra_contains.author_name) LIKE LOWER(?)
            ) THEN 45 ELSE 0 END +
            
            -- Token matching (individual words in title and abstract)
            ${tokens.map(() => 
              `CASE WHEN LOWER(rp.research_title) LIKE LOWER(?) THEN 18 ELSE 0 END`
            ).join(' + ')}${tokens.length > 0 ? ' + ' : ''}
            ${tokens.map(() => 
              `CASE WHEN LOWER(COALESCE(rp.research_abstract, '')) LIKE LOWER(?) THEN 12 ELSE 0 END`
            ).join(' + ')}${tokens.length > 0 ? ' + ' : ''}
            
            -- Department match
            CASE WHEN LOWER(COALESCE(d.department_name, '')) LIKE LOWER(?) THEN 25 ELSE 0 END +
            
            -- Year match
            CASE WHEN CAST(rp.year_publication AS CHAR) LIKE ? THEN 15 ELSE 0 END +
            
            -- Availability bonus
            CASE WHEN rp.status = 'Available' THEN 8 ELSE 0 END
          ) AS relevance_score
        FROM research_papers rp
        LEFT JOIN research_author ra ON rp.research_paper_id = ra.research_paper_id
        LEFT JOIN departments d ON rp.department_id = d.department_id
        LEFT JOIN ratings r ON rp.research_paper_id = r.research_paper_id
        WHERE ${whereConditions.join(' OR ')}
        GROUP BY rp.research_paper_id, rp.research_title, rp.research_abstract, 
                 rp.year_publication, d.department_name, rp.status
        HAVING relevance_score > 0
        ORDER BY 
          relevance_score DESC,
          average_rating DESC,
          CASE WHEN rp.status = 'Available' THEN 0 ELSE 1 END,
          rp.year_publication DESC,
          rp.research_title ASC
        LIMIT ?`,
        [
          ...params, // WHERE clause params
          // Relevance score parameters
          original, // exact title
          `${original}%`, // title starts with
          `%${original}%`, `%${original}%`, // contains original (title, abstract)
          `%${normalized}%`, `%${normalized}%`, // normalized (title, abstract)
          original, `%${original}%`, // author (exact, contains)
          ...tokens.map(t => `%${t}%`), // title tokens
          ...tokens.map(t => `%${t}%`), // abstract tokens
          `%${original}%`, `%${original}%`, // department, year
          parseInt(limit)
        ]
      );

      console.log(`✅ Found ${papers.length} research papers matching "${original}"`);
      
      return {
        success: true,
        count: papers.length,
        papers: papers,
        query: original
      };
    } catch (error) {
      console.error('Error searching research papers:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get FAQs
   */
  get_faqs: async ({ category = 'all' } = {}) => {
    try {
      let query = `SELECT id, question, answer, category, is_active 
                   FROM chatbot_faqs 
                   WHERE is_active = 1`;
      const params = [];

      if (category && category !== 'all') {
        query += ` AND category = ?`;
        params.push(category);
      }

      query += ` ORDER BY sort_order, id`;

      const [faqs] = await pool.query(query, params);
      
      return {
        success: true,
        count: faqs.length,
        faqs: faqs
      };
    } catch (error) {
      console.error('Error getting FAQs:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get library rules and regulations
   */
  get_library_rules: async () => {
    try {
      const [rules] = await pool.query(
        `SELECT rule_id, rule_title, rule_description, category, is_active 
         FROM library_rules 
         WHERE is_active = 1
         ORDER BY category, rule_id`
      );
      
      return {
        success: true,
        count: rules.length,
        rules: rules
      };
    } catch (error) {
      console.error('Error getting library rules:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get popular books
   */
  get_popular_books: async ({ type, limit = 10 }) => {
    try {
      let query = '';
      
      if (type === 'most_borrowed') {
        query = `
          SELECT 
            b.book_id,
            b.book_title,
            ba.book_author AS author,
            CASE 
              WHEN b.isUsingDepartment = 1 THEN d.department_name 
              ELSE bg.book_genre 
            END AS category,
            b.status,
            COUNT(t.transaction_id) as borrow_count
          FROM books b
          LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
          LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
          LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
          LEFT JOIN transactions t ON b.book_id = t.book_id
          WHERE t.transaction_type = 'borrow'
          GROUP BY b.book_id
          ORDER BY borrow_count DESC
          LIMIT ?
        `;
      } else if (type === 'highest_rated') {
        query = `
          SELECT 
            b.book_id,
            b.book_title,
            ba.book_author AS author,
            CASE 
              WHEN b.isUsingDepartment = 1 THEN d.department_name 
              ELSE bg.book_genre 
            END AS category,
            b.status,
            AVG(r.star_rating) as average_rating,
            COUNT(r.rating_id) as rating_count
          FROM books b
          LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
          LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
          LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
          INNER JOIN ratings r ON b.book_id = r.book_id
          GROUP BY b.book_id
          HAVING rating_count >= 3
          ORDER BY average_rating DESC, rating_count DESC
          LIMIT ?
        `;
      } else if (type === 'recently_added') {
        query = `
          SELECT 
            b.book_id,
            b.book_title,
            ba.book_author AS author,
            CASE 
              WHEN b.isUsingDepartment = 1 THEN d.department_name 
              ELSE bg.book_genre 
            END AS category,
            b.status,
            b.created_at as date_added
          FROM books b
          LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
          LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
          LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
          ORDER BY b.created_at DESC
          LIMIT ?
        `;
      }

      const [books] = await pool.query(query, [parseInt(limit)]);
      
      return {
        success: true,
        type: type,
        count: books.length,
        books: books
      };
    } catch (error) {
      console.error('Error getting popular books:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get user's currently borrowed books
   */
  get_user_borrowed_books: async ({ user_id }) => {
    try {
      const [transactions] = await pool.query(
        `SELECT 
          t.transaction_id,
          t.borrow_date,
          t.due_date,
          t.status,
          b.book_id,
          b.book_title as title,
          b.book_title as book_title,
          ba.book_author AS author,
          b.book_number,
          DATEDIFF(t.due_date, CURDATE()) as days_until_due,
          CASE 
            WHEN CURDATE() > t.due_date THEN DATEDIFF(CURDATE(), t.due_date)
            ELSE 0
          END as days_overdue
        FROM transactions t
        INNER JOIN books b ON t.book_id = b.book_id
        LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
        WHERE t.user_id = ? AND t.status = 'borrowed'
        ORDER BY t.due_date ASC`,
        [user_id]
      );
      
      return {
        success: true,
        count: transactions.length,
        borrowed_books: transactions
      };
    } catch (error) {
      console.error('Error getting user borrowed books:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get user transaction history
   */
  get_user_transaction_history: async ({ user_id, limit = 20 }) => {
    try {
      const [transactions] = await pool.query(
        `SELECT 
          t.transaction_id,
          t.transaction_type,
          t.borrow_date,
          t.return_date,
          t.due_date,
          t.status,
          b.book_title as book_title,
          ba.book_author AS author,
          CASE 
            WHEN t.return_date > t.due_date THEN DATEDIFF(t.return_date, t.due_date)
            ELSE 0
          END as days_late
        FROM transactions t
        INNER JOIN books b ON t.book_id = b.book_id
        LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
        WHERE t.user_id = ?
        ORDER BY t.borrow_date DESC
        LIMIT ?`,
        [user_id, parseInt(limit)]
      );
      
      return {
        success: true,
        count: transactions.length,
        transactions: transactions
      };
    } catch (error) {
      console.error('Error getting transaction history:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Recommend books with intelligent selection:
   * 1. If user has transaction history, use those categories/genres
   * 2. If no history, use user's department
   * 3. Prioritize items with ratings and reviews
   * 4. Fill remaining slots with random selections matching preferences
   */
  recommend_books: async ({ user_id, category, limit = 5 }) => {
    try {
      const requestedLimit = parseInt(limit);
      let recommendations = [];
      let preferredCategories = [];
      let userDept = null;
      
      // STEP 1: Determine user preferences (transaction history or department)
      if (user_id) {
        // Check transaction history first
        const [userHistory] = await pool.query(
          `SELECT DISTINCT 
            CASE 
              WHEN b.isUsingDepartment = 1 THEN d.department_name 
              ELSE bg.book_genre 
            END AS category,
            COUNT(*) as borrow_count
           FROM transactions t
           INNER JOIN books b ON t.book_id = b.book_id
           LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
           LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
           WHERE t.user_id = ? AND t.transaction_type = 'borrow'
           GROUP BY category
           ORDER BY borrow_count DESC
           LIMIT 3`,
          [user_id]
        );

        preferredCategories = userHistory.map(row => row.category).filter(c => c);

        // If no history, get user's department
        if (preferredCategories.length === 0) {
          const [userInfo] = await pool.query(
            `SELECT d.department_name
             FROM users u
             LEFT JOIN departments d ON u.department_id = d.department_id
             WHERE u.user_id = ?`,
            [user_id]
          );
          if (userInfo.length > 0 && userInfo[0].department_name) {
            userDept = userInfo[0].department_name;
            preferredCategories = [userDept];
            console.log(`📚 Using user department: ${userDept}`);
          }
        } else {
          console.log(`📚 Found user preferences from history: ${preferredCategories.join(', ')}`);
        }
      }

      // STEP 2: Get books with ratings and reviews (prioritized)
      if (preferredCategories.length > 0) {
        const placeholders = preferredCategories.map(() => '?').join(',');
        const [ratedBooks] = await pool.query(
          `SELECT 
            b.book_title as title,
            ba.book_author AS author,
            CASE 
              WHEN b.isUsingDepartment = 1 THEN d.department_name 
              ELSE bg.book_genre 
            END AS category,
            COUNT(DISTINCT b.book_id) as total_copies,
            SUM(CASE WHEN b.status = 'Available' THEN 1 ELSE 0 END) as available_copies,
            CASE 
              WHEN SUM(CASE WHEN b.status = 'Available' THEN 1 ELSE 0 END) > 0 
              THEN 'Available' 
              ELSE 'Not Available' 
            END as status,
            COALESCE(AVG(r.star_rating), 0) as average_rating,
            COUNT(DISTINCT r.rating_id) as rating_count
          FROM books b
          LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
          LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
          LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
          LEFT JOIN ratings r ON b.book_id = r.book_id
          WHERE (
            (b.isUsingDepartment = 1 AND d.department_name IN (${placeholders}))
            OR (b.isUsingDepartment = 0 AND bg.book_genre IN (${placeholders}))
          )
          ${user_id ? `AND b.book_title NOT IN (
            SELECT DISTINCT bk.book_title FROM books bk
            INNER JOIN transactions tr ON bk.book_id = tr.book_id
            WHERE tr.user_id = ? AND tr.transaction_type = 'borrow'
          )` : ''}
          GROUP BY b.book_title, ba.book_author, category
          HAVING rating_count > 0 AND available_copies > 0
          ORDER BY average_rating DESC, rating_count DESC
          LIMIT ?`,
          user_id ? 
            [...preferredCategories, ...preferredCategories, user_id, requestedLimit] :
            [...preferredCategories, ...preferredCategories, requestedLimit]
        );

        recommendations = ratedBooks;
      }

      // STEP 3: If we need more to reach the limit, fill with random matching selections
      if (recommendations.length < requestedLimit && preferredCategories.length > 0) {
        const remaining = requestedLimit - recommendations.length;
        const placeholders = preferredCategories.map(() => '?').join(',');
        const excludeTitles = recommendations.map(r => r.title);
        const excludePlaceholders = excludeTitles.length > 0 ? excludeTitles.map(() => '?').join(',') : "''";
        
        const [randomBooks] = await pool.query(
          `SELECT 
            b.book_title as title,
            ba.book_author AS author,
            CASE 
              WHEN b.isUsingDepartment = 1 THEN d.department_name 
              ELSE bg.book_genre 
            END AS category,
            COUNT(DISTINCT b.book_id) as total_copies,
            SUM(CASE WHEN b.status = 'Available' THEN 1 ELSE 0 END) as available_copies,
            CASE 
              WHEN SUM(CASE WHEN b.status = 'Available' THEN 1 ELSE 0 END) > 0 
              THEN 'Available' 
              ELSE 'Not Available' 
            END as status,
            COALESCE(AVG(r.star_rating), 0) as average_rating,
            COUNT(DISTINCT r.rating_id) as rating_count
          FROM books b
          LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
          LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
          LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
          LEFT JOIN ratings r ON b.book_id = r.book_id
          WHERE (
            (b.isUsingDepartment = 1 AND d.department_name IN (${placeholders}))
            OR (b.isUsingDepartment = 0 AND bg.book_genre IN (${placeholders}))
          )
          ${excludeTitles.length > 0 ? `AND b.book_title NOT IN (${excludePlaceholders})` : ''}
          ${user_id ? `AND b.book_title NOT IN (
            SELECT DISTINCT bk.book_title FROM books bk
            INNER JOIN transactions tr ON bk.book_id = tr.book_id
            WHERE tr.user_id = ? AND tr.transaction_type = 'borrow'
          )` : ''}
          GROUP BY b.book_title, ba.book_author, category
          HAVING available_copies > 0
          ORDER BY RAND()
          LIMIT ?`,
          user_id ?
            [...preferredCategories, ...preferredCategories, ...excludeTitles, user_id, remaining] :
            [...preferredCategories, ...preferredCategories, ...excludeTitles, remaining]
        );

        recommendations = [...recommendations, ...randomBooks];
      }

      // STEP 4: If still no results, fallback to general highly-rated books
      if (recommendations.length === 0) {
        console.log('📚 Using general recommendations (highest rated books)...');
        
        const [generalRecs] = await pool.query(
          `SELECT 
            b.book_title as title,
            ba.book_author AS author,
            CASE 
              WHEN b.isUsingDepartment = 1 THEN d.department_name 
              ELSE bg.book_genre 
            END AS category,
            COUNT(DISTINCT b.book_id) as total_copies,
            SUM(CASE WHEN b.status = 'Available' THEN 1 ELSE 0 END) as available_copies,
            CASE 
              WHEN SUM(CASE WHEN b.status = 'Available' THEN 1 ELSE 0 END) > 0 
              THEN 'Available' 
              ELSE 'Not Available' 
            END as status,
            COALESCE(AVG(r.star_rating), 0) as average_rating,
            COUNT(DISTINCT r.rating_id) as rating_count
          FROM books b
          LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
          LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
          LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
          LEFT JOIN ratings r ON b.book_id = r.book_id
          GROUP BY b.book_title, ba.book_author, category
          HAVING available_copies > 0 AND rating_count > 0
          ORDER BY average_rating DESC, rating_count DESC
          LIMIT ?`,
          [requestedLimit]
        );

        recommendations = generalRecs;
      }
      
      return {
        success: true,
        count: recommendations.length,
        recommendations: recommendations,
        source: preferredCategories.length > 0 ? 'personalized' : 'general'
      };
    } catch (error) {
      console.error('Error recommending books:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Recommend research papers with intelligent selection:
   * 1. If user has transaction history, use those topics/categories
   * 2. If no history, use user's department
   * 3. Prioritize papers with ratings and reviews
   * 4. Fill remaining slots with random selections matching preferences
   */
  recommend_research_papers: async ({ user_id, limit = 5 }) => {
    try {
      const requestedLimit = parseInt(limit);
      let recommendations = [];
      let preferredDepartment = null;
      
      // STEP 1: Determine user preferences (transaction history or department)
      if (user_id) {
        // Check if user has borrowed research papers before
        const [userHistory] = await pool.query(
          `SELECT DISTINCT d.department_name, COUNT(*) as borrow_count
           FROM transactions t
           INNER JOIN research_papers rp ON t.research_paper_id = rp.research_paper_id
           INNER JOIN departments d ON rp.department_id = d.department_id
           WHERE t.user_id = ? AND t.transaction_type = 'borrow'
           GROUP BY d.department_name
           ORDER BY borrow_count DESC
           LIMIT 1`,
          [user_id]
        );

        if (userHistory.length > 0 && userHistory[0].department_name) {
          preferredDepartment = userHistory[0].department_name;
          console.log(`📄 Found user preference from history: ${preferredDepartment}`);
        } else {
          // No history, use user's department
          const [userInfo] = await pool.query(
            `SELECT d.department_name
             FROM users u
             LEFT JOIN departments d ON u.department_id = d.department_id
             WHERE u.user_id = ?`,
            [user_id]
          );
          if (userInfo.length > 0 && userInfo[0].department_name) {
            preferredDepartment = userInfo[0].department_name;
            console.log(`📄 Using user department: ${preferredDepartment}`);
          }
        }
      }

      // STEP 2: Get research papers with ratings and reviews (prioritized)
      if (preferredDepartment) {
        const [ratedPapers] = await pool.query(
          `SELECT 
            rp.research_paper_id,
            rp.research_title as title,
            GROUP_CONCAT(DISTINCT ra.author_name SEPARATOR ', ') as author,
            rp.year_publication as publication_year,
            d.department_name as category,
            rp.status,
            CASE 
              WHEN rp.status = 'Available' THEN 'Available'
              ELSE 'Not Available'
            END as availability_status,
            COALESCE(AVG(r.star_rating), 0) as average_rating,
            COUNT(DISTINCT r.rating_id) as rating_count
          FROM research_papers rp
          INNER JOIN departments d ON rp.department_id = d.department_id
          LEFT JOIN research_author ra ON rp.research_paper_id = ra.research_paper_id
          LEFT JOIN ratings r ON rp.research_paper_id = r.research_paper_id
          WHERE d.department_name = ?
          AND rp.status = 'Available'
          ${user_id ? `AND rp.research_title NOT IN (
            SELECT DISTINCT rp2.research_title FROM research_papers rp2
            INNER JOIN transactions tr ON rp2.research_paper_id = tr.research_paper_id
            WHERE tr.user_id = ? AND tr.transaction_type = 'borrow'
          )` : ''}
          GROUP BY rp.research_paper_id, rp.research_title, rp.year_publication, d.department_name, rp.status
          HAVING rating_count > 0
          ORDER BY average_rating DESC, rating_count DESC, rp.year_publication DESC
          LIMIT ?`,
          user_id ? [preferredDepartment, user_id, requestedLimit] : [preferredDepartment, requestedLimit]
        );

        recommendations = ratedPapers;
      }

      // STEP 3: If we need more to reach the limit, fill with random matching selections
      if (recommendations.length < requestedLimit && preferredDepartment) {
        const remaining = requestedLimit - recommendations.length;
        const excludeTitles = recommendations.map(r => r.title);
        const excludePlaceholders = excludeTitles.length > 0 ? excludeTitles.map(() => '?').join(',') : "''";
        
        const [randomPapers] = await pool.query(
          `SELECT 
            rp.research_paper_id,
            rp.research_title as title,
            GROUP_CONCAT(DISTINCT ra.author_name SEPARATOR ', ') as author,
            rp.year_publication as publication_year,
            d.department_name as category,
            rp.status,
            CASE 
              WHEN rp.status = 'Available' THEN 'Available'
              ELSE 'Not Available'
            END as availability_status,
            COALESCE(AVG(r.star_rating), 0) as average_rating,
            COUNT(DISTINCT r.rating_id) as rating_count
          FROM research_papers rp
          INNER JOIN departments d ON rp.department_id = d.department_id
          LEFT JOIN research_author ra ON rp.research_paper_id = ra.research_paper_id
          LEFT JOIN ratings r ON rp.research_paper_id = r.research_paper_id
          WHERE d.department_name = ?
          AND rp.status = 'Available'
          ${excludeTitles.length > 0 ? `AND rp.research_title NOT IN (${excludePlaceholders})` : ''}
          ${user_id ? `AND rp.research_title NOT IN (
            SELECT DISTINCT rp2.research_title FROM research_papers rp2
            INNER JOIN transactions tr ON rp2.research_paper_id = tr.research_paper_id
            WHERE tr.user_id = ? AND tr.transaction_type = 'borrow'
          )` : ''}
          GROUP BY rp.research_paper_id, rp.research_title, rp.year_publication, d.department_name, rp.status
          ORDER BY RAND()
          LIMIT ?`,
          user_id ? 
            [preferredDepartment, ...excludeTitles, user_id, remaining] : 
            [preferredDepartment, ...excludeTitles, remaining]
        );

        recommendations = [...recommendations, ...randomPapers];
      }

      // STEP 4: If still no results, fallback to general highly-rated papers
      if (recommendations.length === 0) {
        console.log('📄 Using general recommendations (highest rated papers)...');
        
        const [generalRecs] = await pool.query(
          `SELECT 
            rp.research_paper_id,
            rp.research_title as title,
            GROUP_CONCAT(DISTINCT ra.author_name SEPARATOR ', ') as author,
            rp.year_publication as publication_year,
            d.department_name as category,
            rp.status,
            CASE WHEN rp.status = 'Available' THEN 'Available' ELSE 'Not Available' END as availability_status,
            COALESCE(AVG(r.star_rating), 0) as average_rating,
            COUNT(DISTINCT r.rating_id) as rating_count
          FROM research_papers rp
          LEFT JOIN departments d ON rp.department_id = d.department_id
          LEFT JOIN research_author ra ON rp.research_paper_id = ra.research_paper_id
          LEFT JOIN ratings r ON rp.research_paper_id = r.research_paper_id
          WHERE rp.status = 'Available'
          GROUP BY rp.research_paper_id, rp.research_title, rp.year_publication, d.department_name, rp.status
          HAVING rating_count > 0
          ORDER BY average_rating DESC, rating_count DESC, rp.year_publication DESC
          LIMIT ?`,
          [requestedLimit]
        );

        recommendations = generalRecs;
      }
      
      return {
        success: true,
        count: recommendations.length,
        papers: recommendations,
        source: preferredDepartment ? 'personalized' : 'general'
      };
    } catch (error) {
      console.error('Error recommending research papers:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get all book categories
   */
  get_book_categories: async () => {
    try {
      const [categories] = await pool.query(
        `SELECT 
          CASE 
            WHEN b.isUsingDepartment = 1 THEN d.department_name 
            ELSE bg.book_genre 
          END AS category,
          COUNT(*) as book_count
         FROM books b
         LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
         LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
         GROUP BY category
         HAVING category IS NOT NULL
         ORDER BY category`
      );
      
      return {
        success: true,
        count: categories.length,
        categories: categories
      };
    } catch (error) {
      console.error('Error getting book categories:', error);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Execute a tool by name with parameters
 */
async function executeTool(toolName, parameters) {
  if (toolImplementations[toolName]) {
    return await toolImplementations[toolName](parameters);
  }
  return { success: false, error: `Tool ${toolName} not found` };
}

module.exports = {
  toolDefinitions,
  toolImplementations,
  executeTool
};
