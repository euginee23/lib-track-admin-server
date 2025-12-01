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
 * Tool Implementations
 */
const toolImplementations = {
  /**
   * Search for books in the catalog
   */
  search_books: async ({ query, limit = 10 }) => {
    try {
      // Normalize query and build tokenized author-matching so searches succeed
      // even when author names are stored as "Last, First" or contain punctuation.
      const normalized = (query || '').replace(/[.,;:\/()\[\]"']/g, ' ').trim();
      const tokensRaw = normalized.split(/\s+/).filter(Boolean);

      // Preserve single-letter initials that were written with a dot in the original query (e.g. "H.")
      const original = query || '';
      const initialMatches = (original.match(/\b[A-Za-z]\.(?=\s|$)/g) || []).map(s => s.replace('.', '').toLowerCase());

      // Remove common stopwords and ignore very short noisy tokens (like 'a', 'by', 'the')
      const stopwords = new Set(['a','an','the','by','of','for','can','could','would','should','you','please','find','book','books','is','are','in','on','at','to','from','with','and','or','that','this','these','those']);

      const tokens = tokensRaw
        .map(t => t.toLowerCase())
        .filter(t => {
          if (!t) return false;
          if (initialMatches.includes(t)) return true; // keep initials like 'h'
          if (stopwords.has(t)) return false;
          if (t.length < 2) return false; // ignore single-letter noise unless it's an initial
          return true;
        });

      // Debug: log token decisions
      console.debug('search_books tokensRaw:', tokensRaw, 'initials:', initialMatches, 'tokensFiltered:', tokens);

      // Base params and parts for the WHERE clause
      const params = [];

      // Title, book_number, batch key, genre, department (broad checks)
      const titlePattern = `%${query}%`;
      params.push(titlePattern);

      // We'll build an author clause that requires all tokens to appear in the stored author string
      let authorClause = '';
      if (tokens.length > 0) {
        // Strict: require all tokens (helps precise matches)
        const authorConditionsAll = tokens.map(() => `LOWER(COALESCE(ba.book_author, '')) LIKE ?`).join(' AND ');
        // Permissive: match if any token appears (helps partial/short queries)
        const authorConditionsAny = tokens.map(() => `LOWER(COALESCE(ba.book_author, '')) LIKE ?`).join(' OR ');
        authorClause = `(${authorConditionsAll} OR ${authorConditionsAny})`;
        // push params for the ALL check, then params for the ANY check
        tokens.forEach(t => params.push(`%${t}%`));
        tokens.forEach(t => params.push(`%${t}%`));
      } else {
        // fallback single LIKE on raw query
        params.push(titlePattern);
        authorClause = `LOWER(COALESCE(ba.book_author, '')) LIKE ?`;
      }

      // other broad search patterns
      const otherPatterns = [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`];
      params.push(...otherPatterns);

      // Final LIMIT param
      params.push(parseInt(limit));

      // First, if tokens look like a person name (there is at least one token >=3 chars),
      // try a focused author search to avoid broad matches returning unrelated titles.
      const surnameToken = tokens.slice(-1)[0];
      console.debug('search_books debug: tokens=', tokens, 'surnameToken=', surnameToken, 'originalQuery=', query);
      if (surnameToken && surnameToken.length >= 3) {
        try {
          const authorParams = [`%${surnameToken}%`, parseInt(limit)];
          console.debug('search_books debug: running author-focused query with params=', authorParams);
          const [authorBooks] = await pool.query(
            `SELECT
              b.book_id,
              b.book_title AS title,
              b.book_title AS book_title,
              COALESCE(ba.book_author, '') AS author,
              b.book_number,
              COALESCE(bp.publisher, '') AS publisher,
              b.book_year AS publication_year,
              CASE 
                WHEN b.isUsingDepartment = 1 THEN d.department_name 
                ELSE bg.book_genre 
              END AS category,
              b.book_edition,
              b.batch_registration_key,
              b.status,
              CASE
                WHEN b.status = 'Available' THEN 'Available'
                ELSE 'Not Available'
              END AS availability_status
            FROM books b
            LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
            LEFT JOIN book_publisher bp ON b.book_publisher_id = bp.book_publisher_id
            LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
            LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
            WHERE LOWER(COALESCE(ba.book_author, '')) LIKE LOWER(?)
            ORDER BY CASE WHEN b.status = 'Available' THEN 0 ELSE 1 END, b.book_title
            LIMIT ?`,
            authorParams
          );

          console.debug('search_books debug: author-focused returned count=', authorBooks && authorBooks.length);
          if (authorBooks && authorBooks.length > 0) {
            console.debug('search_books debug: author-focused sample:', authorBooks.slice(0,6).map(b=>({title:b.book_title, author:b.book_author||b.author}))); 
            return { success: true, count: authorBooks.length, books: authorBooks };
          }
        } catch (e) {
          console.warn('author-focused query failed, falling back to broad search:', e && e.message);
        }
      }

      // Construct WHERE: match title OR (author tokens) OR book number OR batch key OR genre OR department
      const whereParts = [
        `b.book_title LIKE ?`,
        `(${authorClause})`,
        `b.book_number LIKE ?`,
        `b.batch_registration_key LIKE ?`,
        `bg.book_genre LIKE ?`,
        `d.department_name LIKE ?`
      ];

      const sql = `SELECT
          b.book_id,
          b.book_title AS title,
          b.book_title AS book_title,
          COALESCE(ba.book_author, '') AS author,
          b.book_number,
          COALESCE(bp.publisher, '') AS publisher,
          b.book_year AS publication_year,
          CASE 
            WHEN b.isUsingDepartment = 1 THEN d.department_name 
            ELSE bg.book_genre 
          END AS category,
          b.book_edition,
          b.batch_registration_key,
          b.status,
          CASE
            WHEN b.status = 'Available' THEN 'Available'
            ELSE 'Not Available'
          END AS availability_status
        FROM books b
        LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
        LEFT JOIN book_publisher bp ON b.book_publisher_id = bp.book_publisher_id
        LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
        LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
        WHERE ${whereParts.join('\n          OR ')}
        ORDER BY
          CASE WHEN b.status = 'Available' THEN 0 ELSE 1 END,
          b.book_title
        LIMIT ?`;


      console.debug('search_books debug: running broad search SQL with params length=', params.length);
      console.debug('search_books debug: SQL preview=', sql.substring(0, 400));
      const [books] = await pool.query(sql, params);

      // Log a sample of returned books for debugging
      if (books && books.length > 0) {
        try {
          console.debug('search_books debug: broad search returned count=', books.length, 'sample:', books.slice(0,6).map(b=>({title:b.title||b.book_title, author:b.author||b.book_author, book_number:b.book_number}))); 
        } catch (e) {
          console.debug('search_books debug: error logging sample', e && e.message);
        }
      } else {
        console.warn('search_books returned 0 rows. SQL:', sql);
        console.warn('search_books params:', params);
      }

      return {
        success: true,
        count: books.length,
        books: books
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
   * Search research papers
   */
  search_research_papers: async ({ query, limit = 10 }) => {
    try {
      const searchPattern = `%${query}%`;
      console.log('🔎 search_research_papers called with pattern:', searchPattern, 'limit:', limit);

      // Primary (rich) query - include authors and department names
      try {
        const [papers] = await pool.query(
          `SELECT 
            rp.research_paper_id,
            rp.research_title AS title,
            GROUP_CONCAT(DISTINCT ra.author_name) AS author,
            rp.research_abstract AS abstract,
            rp.year_publication AS publication_year,
            d.department_name AS category,
            rp.status,
            CASE 
              WHEN rp.status = 'Available' THEN 'Available'
              ELSE 'Not Available'
            END as availability_status
          FROM research_papers rp
          LEFT JOIN research_author ra ON rp.research_paper_id = ra.research_paper_id
          LEFT JOIN departments d ON rp.department_id = d.department_id
          WHERE rp.research_title LIKE ? OR ra.author_name LIKE ? OR d.department_name LIKE ? OR rp.research_abstract LIKE ?
          GROUP BY rp.research_paper_id
          ORDER BY 
            CASE WHEN rp.status = 'Available' THEN 0 ELSE 1 END,
            rp.year_publication DESC
          LIMIT ?`,
          [searchPattern, searchPattern, searchPattern, searchPattern, parseInt(limit)]
        );

        return {
          success: true,
          count: papers.length,
          papers: papers
        };
      } catch (innerErr) {
        console.warn('search_research_papers primary query failed, falling back:', innerErr.message);
        // Fallback: simpler query that still attempts to include authors
        const [papers] = await pool.query(
          `SELECT 
            rp.research_paper_id,
            rp.research_title AS title,
            GROUP_CONCAT(DISTINCT ra.author_name) AS author,
            rp.research_abstract AS abstract,
            rp.year_publication AS publication_year,
            rp.status
          FROM research_papers rp
          LEFT JOIN research_author ra ON rp.research_paper_id = ra.research_paper_id
          WHERE rp.research_title LIKE ? OR rp.research_abstract LIKE ?
          GROUP BY rp.research_paper_id
          ORDER BY rp.year_publication DESC
          LIMIT ?`,
          [searchPattern, searchPattern, parseInt(limit)]
        );

        return {
          success: true,
          count: papers.length,
          papers: papers
        };
      }
      
      return {
        success: true,
        count: papers.length,
        papers: papers
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
   * Recommend books based on user history
   * Smart algorithm:
   * 1. Check user's transaction history for preferences
   * 2. If no history, check user's department
   * 3. Prioritize highly rated and most borrowed books
   */
  recommend_books: async ({ user_id, category, limit = 5 }) => {
    try {
      let recommendations = [];
      
      // STEP 1: Try to get recommendations based on user's borrowing history
      if (user_id) {
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
           LIMIT 2`,
          [user_id]
        );

        const preferredCategories = userHistory.map(row => row.category).filter(c => c);

        // If user has borrowing history, recommend from their preferred categories
        if (preferredCategories.length > 0) {
          console.log(`📚 Found user preferences: ${preferredCategories.join(', ')}`);
          
          const placeholders = preferredCategories.map(() => '?').join(',');
          const [historyBasedRecs] = await pool.query(
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
              COUNT(DISTINCT r.rating_id) as rating_count,
              COUNT(DISTINCT t.transaction_id) as borrow_count
            FROM books b
            LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
            LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
            LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
            LEFT JOIN ratings r ON b.book_id = r.book_id
            LEFT JOIN transactions t ON b.book_id = t.book_id AND t.transaction_type = 'borrow'
            WHERE (
              (b.isUsingDepartment = 1 AND d.department_name IN (${placeholders}))
              OR (b.isUsingDepartment = 0 AND bg.book_genre IN (${placeholders}))
            )
            AND b.book_title NOT IN (
              SELECT DISTINCT bk.book_title FROM books bk
              INNER JOIN transactions tr ON bk.book_id = tr.book_id
              WHERE tr.user_id = ? AND tr.transaction_type = 'borrow'
            )
            GROUP BY b.book_title, ba.book_author, category
            HAVING available_copies > 0
            ORDER BY 
              average_rating DESC,
              borrow_count DESC,
              rating_count DESC
            LIMIT ?`,
            [...preferredCategories, ...preferredCategories, user_id, parseInt(limit)]
          );

          recommendations = historyBasedRecs;
        }
      }

      // STEP 2: If no recommendations yet, try user's department
      if (recommendations.length === 0 && user_id) {
        console.log('📚 No history found, checking user department...');
        
        const [userInfo] = await pool.query(
          `SELECT u.department_id, d.department_name
           FROM users u
           LEFT JOIN departments d ON u.department_id = d.department_id
           WHERE u.user_id = ?`,
          [user_id]
        );

        if (userInfo.length > 0 && userInfo[0].department_name) {
          const userDept = userInfo[0].department_name;
          console.log(`📚 User department: ${userDept}`);

          const [deptBasedRecs] = await pool.query(
            `SELECT 
              b.book_title as title,
              ba.book_author AS author,
              d.department_name AS category,
              COUNT(DISTINCT b.book_id) as total_copies,
              SUM(CASE WHEN b.status = 'Available' THEN 1 ELSE 0 END) as available_copies,
              CASE 
                WHEN SUM(CASE WHEN b.status = 'Available' THEN 1 ELSE 0 END) > 0 
                THEN 'Available' 
                ELSE 'Not Available' 
              END as status,
              COALESCE(AVG(r.star_rating), 0) as average_rating,
              COUNT(DISTINCT r.rating_id) as rating_count,
              COUNT(DISTINCT t.transaction_id) as borrow_count
            FROM books b
            LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
            INNER JOIN departments d ON b.book_genre_id = d.department_id
            LEFT JOIN ratings r ON b.book_id = r.book_id
            LEFT JOIN transactions t ON b.book_id = t.book_id AND t.transaction_type = 'borrow'
            WHERE b.isUsingDepartment = 1 
            AND d.department_name = ?
            GROUP BY b.book_title, ba.book_author, d.department_name
            HAVING available_copies > 0
            ORDER BY 
              average_rating DESC,
              borrow_count DESC,
              rating_count DESC
            LIMIT ?`,
            [userDept, parseInt(limit)]
          );

          recommendations = deptBasedRecs;
        }
      }

      // STEP 3: If still no recommendations, get highest rated and most borrowed books
      if (recommendations.length === 0) {
        console.log('📚 Using general recommendations (highest rated & most borrowed)...');
        
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
            COUNT(DISTINCT r.rating_id) as rating_count,
            COUNT(DISTINCT t.transaction_id) as borrow_count
          FROM books b
          LEFT JOIN book_author ba ON b.book_author_id = ba.book_author_id
          LEFT JOIN book_genre bg ON b.book_genre_id = bg.book_genre_id AND b.isUsingDepartment = 0
          LEFT JOIN departments d ON b.book_genre_id = d.department_id AND b.isUsingDepartment = 1
          LEFT JOIN ratings r ON b.book_id = r.book_id
          LEFT JOIN transactions t ON b.book_id = t.book_id AND t.transaction_type = 'borrow'
          GROUP BY b.book_title, ba.book_author, category
          HAVING available_copies > 0 AND (rating_count >= 1 OR borrow_count >= 1)
          ORDER BY 
            average_rating DESC,
            borrow_count DESC,
            rating_count DESC
          LIMIT ?`,
          [parseInt(limit)]
        );

        recommendations = generalRecs;
      }
      
      return {
        success: true,
        count: recommendations.length,
        recommendations: recommendations,
        source: recommendations.length > 0 ? 
          (user_id ? 'personalized' : 'general') : 'none'
      };
    } catch (error) {
      console.error('Error recommending books:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Recommend research papers based on user department and preferences
   * Smart algorithm similar to book recommendations
   */
  recommend_research_papers: async ({ user_id, limit = 5 }) => {
    try {
      let recommendations = [];
      
      // STEP 1: Check user's department for relevant research
      if (user_id) {
        const [userInfo] = await pool.query(
          `SELECT u.department_id, d.department_name
           FROM users u
           LEFT JOIN departments d ON u.department_id = d.department_id
           WHERE u.user_id = ?`,
          [user_id]
        );

        if (userInfo.length > 0 && userInfo[0].department_name) {
          const userDept = userInfo[0].department_name;
          console.log(`📄 Recommending research papers for department: ${userDept}`);

          const [deptPapers] = await pool.query(
            `SELECT 
              rp.research_paper_id,
              rp.research_title as title,
              rp.research_abstract,
              rp.year_publication,
              rp.research_authors as authors,
              d.department_name as category,
              rp.availability_status as status
            FROM research_papers rp
            INNER JOIN departments d ON rp.department_id = d.department_id
            WHERE d.department_name = ?
            AND rp.availability_status = 'Available'
            ORDER BY rp.year_publication DESC
            LIMIT ?`,
            [userDept, parseInt(limit)]
          );

          recommendations = deptPapers;
        }
      }

      // STEP 2: If no department match, get recent/available papers
      if (recommendations.length === 0) {
        console.log('📄 Using general research paper recommendations...');
        
        const [generalPapers] = await pool.query(
          `SELECT 
            rp.research_paper_id,
            rp.research_title as title,
            rp.research_abstract,
            rp.year_publication,
            rp.research_authors as authors,
            d.department_name as category,
            rp.availability_status as status
          FROM research_papers rp
          LEFT JOIN departments d ON rp.department_id = d.department_id
          WHERE rp.availability_status = 'Available'
          ORDER BY rp.year_publication DESC
          LIMIT ?`,
          [parseInt(limit)]
        );

        recommendations = generalPapers;
      }
      
      return {
        success: true,
        count: recommendations.length,
        papers: recommendations,
        source: user_id ? 'personalized' : 'general'
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
