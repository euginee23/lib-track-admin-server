const { executeTool } = require('./chatbotTools');

/**
 * Rule-Based Chatbot Service
 * Handles user queries with pattern matching and database lookups
 * No AI dependencies - fast and deterministic responses
 */

class RuleBasedChatbot {
  constructor() {
    // Initialize patterns for different intents
    this.patterns = {
      greeting: [
        /^(hi|hello|hey|greetings?|good\s+(morning|afternoon|evening)|howdy|yo)[!.,?\s]*$/i,
        /^(what'?s?\s+up|sup)[!.,?\s]*$/i
      ],
      farewell: [
        /^(bye|goodbye|see\s+you|talk\s+later|take\s+care|farewell|cya)[!.,?\s]*$/i
      ],
      thanks: [
        /^(thanks?|thank\s*you|thx|ty|appreciated?|cheers)[!.,?\s]*$/i
      ],
      help: [
        /\b(help|assist|support|guide|how\s+do\s+i)\b/i
      ],
      libraryHours: [
        /\b(hours?|open(?:ing)?|clos(?:e|ing)|schedule|time|when.*(?:open|close|library))\b/i
      ],
      bookSearch: [
        /\b(?:search|find|look(?:ing)?\s+for|where\s+(?:is|can\s+i\s+find)|locate)\b.*\b(?:book|title|author)/i,
        /\b(?:book|title|author)\b.*\b(?:search|find|available|have|exist)/i,
        /\b(?:do\s+you\s+have|is\s+there|got\s+any)\b.*\bbook/i
      ],
      bookAvailability: [
        /\b(availab(?:le|ility)|in\s+stock|can\s+i\s+(?:borrow|get))\b/i
      ],
      borrowInfo: [
        /\b(borrow(?:ing)?|checkout|loan|lend(?:ing)?|how\s+to\s+borrow)\b/i
      ],
      returnInfo: [
        /\b(return(?:ing)?|give\s+back|how\s+to\s+return)\b/i
      ],
      researchPapers: [
        /\b(research\s+paper|thesis|dissertation|journal|academic|scholarly)\b/i,
        /\b(suggest|recommend|find|search|looking?\s+for).*\b(research|paper|thesis|dissertation)\b/i,
        /\b(research|paper|thesis|dissertation)\b.*(suggest|recommend|find|search|available)\b/i
      ],
      recommendations: [
        /\b(recommend(?:ation)?s?|suggest(?:ion)?s?)\s+(?:a\s+)?book/i,
        /\bbook\b.*\b(recommend(?:ation)?s?|suggest(?:ion)?s?)/i,
        /\b(what\s+should\s+i\s+read|popular\s+book|trending\s+book)\b/i
      ],
      penalties: [
        /\b(penalty|penalt(?:ies)|fine|late\s+fee|overdue)\b/i
      ],
      rules: [
        /\b(rules?|regulations?|polic(?:y|ies)|guidelines?)\b/i
      ],
      account: [
        /\b(account|profile|my\s+(?:book|borrow|transaction|history))\b/i
      ],
      faq: [
        /\b(faq|frequently\s+asked|common\s+question)\b/i
      ]
    };

    // Predefined responses
    this.responses = {
      greeting: (userName = 'there') => `Hello ${userName}! 👋\n\nI can help you with:\n📚 Books & research papers\n🕐 Library hours\n📖 Borrowing & returns\n💡 Recommendations\n\nWhat do you need?`,
      
      farewell: () => `Goodbye! Have a great day! 😊`,
      
      thanks: () => `You're welcome! Need anything else? 😊`,
      
      libraryHours: () => `📅 Library Hours\n\nRegular:\n• Mon-Fri: 8:00 AM - 6:00 PM\n• Saturday: 9:00 AM - 4:00 PM\n• Sunday: Closed\n\nExam Period:\n• Mon-Fri: 8:00 AM - 8:00 PM\n\nHours may vary during holidays.`,
      
      borrowInfo: () => `📖 How to Borrow\n\n1. Search for the book\n2. Check availability\n3. Visit the kiosk/desk\n4. Present your ID\n5. Complete checkout\n\nLoan Period:\n• Books: 7-14 days\n• Research: 3-7 days\n\nLimit: Up to 3 items\n\nNeed help finding a book?`,
      
      returnInfo: () => `📥 How to Return\n\n1. Visit kiosk or desk\n2. Scan your ID\n3. Place book in return slot\n4. Wait for confirmation\n\nRemember:\n✓ Return before due date\n✓ Check for damage\n✓ Keep your receipt\n\nQuestions about fees?`,
      
      penalties: () => `⚠️ Fines & Penalties\n\nOverdue:\n• Books: ₱5/day\n• Research: ₱10/day\n• Max: ₱200 per item\n\nLost/Damaged:\n• Replacement cost + fee\n\nPayment:\n• Library front desk\n• Keep receipt\n\nUnpaid fines = account restrictions\n\nCheck your account page for current fines.`,
      
      account: () => `👤 Your Account\n\nManage through the portal:\n• View borrowed books\n• Check due dates\n• Transaction history\n• Update info\n• View fines\n\nVisit your Profile page for details.`,
      
      default: () => `Not sure what you need?\n\nI can help with:\n📚 Book search\n🕐 Hours\n📖 Borrowing\n📥 Returns\n💡 Recommendations\n\nPlease rephrase your question.`
    };
  }

  /**
   * Identify the intent from user message
   * Priority order: specific intents (research papers) before general ones (recommendations)
   */
  identifyIntent(message) {
    const trimmed = message.trim().toLowerCase();
    
    // Priority 1: Check for research paper intent first (more specific)
    if (this.patterns.researchPapers) {
      for (const pattern of this.patterns.researchPapers) {
        if (pattern.test(message)) {
          return 'researchPapers';
        }
      }
    }
    
    // Priority 2: Check other intents in order
    const priorityOrder = [
      'greeting', 'farewell', 'thanks', 
      'bookSearch', 'bookAvailability',
      'recommendations', // After research papers
      'borrowInfo', 'returnInfo', 'penalties',
      'libraryHours', 'rules', 'account', 'faq', 'help'
    ];
    
    for (const intent of priorityOrder) {
      if (this.patterns[intent]) {
        for (const pattern of this.patterns[intent]) {
          if (pattern.test(message)) {
            return intent;
          }
        }
      }
    }
    
    return 'unknown';
  }

  /**
   * Extract entities from the message (e.g., book title, author name)
   */
  extractEntities(message) {
    const entities = {
      bookTitle: null,
      authorName: null,
      category: null
    };

    // Extract quoted text as potential book title
    const quoted = message.match(/["']([^"']+)["']/);
    if (quoted) {
      entities.bookTitle = quoted[1];
    }

    // Extract "by [author]" pattern
    const byAuthor = message.match(/\bby\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    if (byAuthor) {
      entities.authorName = byAuthor[1];
    }

    return entities;
  }

  /**
   * Process user message and generate response
   */
  async processMessage(message, context = {}) {
    try {
      const intent = this.identifyIntent(message);
      const entities = this.extractEntities(message);
      const userName = context.userName || 'there';
      const userId = context.userId;

      let response = '';
      let toolUsed = null;

      switch (intent) {
        case 'greeting':
          response = this.responses.greeting(userName);
          break;

        case 'farewell':
          response = this.responses.farewell();
          break;

        case 'thanks':
          response = this.responses.thanks();
          break;

        case 'libraryHours':
          response = this.responses.libraryHours();
          break;

        case 'borrowInfo':
          response = this.responses.borrowInfo();
          break;

        case 'returnInfo':
          response = this.responses.returnInfo();
          break;

        case 'penalties':
          response = this.responses.penalties();
          break;

        case 'account':
          response = this.responses.account();
          break;

        case 'bookSearch':
        case 'bookAvailability':
          // Extract search query
          const searchQuery = entities.bookTitle || entities.authorName || this.extractSearchQuery(message);
          
          if (!searchQuery || searchQuery.length < 2) {
            response = `📚 Search for books\n\nTell me:\n• Book title\n• Author name\n• Keywords\n\nWhat book do you need?`;
          } else {
            // Search for books with enhanced intelligent matching
            const result = await executeTool('search_books', { query: searchQuery, limit: 8 });
            
            if (result.success && result.books && result.books.length > 0) {
              response = `📚 Found ${result.count} book${result.count > 1 ? 's' : ''}:\n\n`;
              
              result.books.forEach((book, index) => {
                const status = book.status === 'Available' ? '✅' : '❌';
                response += `${index + 1}. ${book.title}\n`;
                response += `   By: ${book.author || 'Unknown'}\n`;
                if (book.category) response += `   📁 ${book.category}\n`;
                if (book.publication_year) response += `   📅 ${book.publication_year}\n`;
                if (book.average_rating && book.rating_count > 0) {
                  response += `   ⭐ ${parseFloat(book.average_rating).toFixed(1)} (${book.rating_count} reviews)\n`;
                }
                response += `   ${status} ${book.availability_status}\n\n`;
              });
              
              response += `💡 Tip: I found these using smart search that handles variations in spelling and punctuation!`;
              toolUsed = 'search_books';
            } else {
              response = `I couldn't find "${searchQuery}" 😕\n\nDon't worry! Try:\n✓ Different spelling\n✓ Author's last name\n✓ Keywords or topics\n✓ Partial title\n\nThe search is smart and flexible!`;
            }
          }
          break;

        case 'recommendations':
          // Get popular or recommended books with enhanced matching
          const recResult = userId 
            ? await executeTool('recommend_books', { user_id: userId, limit: 8 })
            : await executeTool('get_popular_books', { type: 'highest_rated', limit: 8 });
          
          if (recResult.success && (recResult.recommendations?.length > 0 || recResult.books?.length > 0)) {
            const books = recResult.recommendations || recResult.books;
            response = `💡 Recommended for you:\n\n`;
            
            books.forEach((book, index) => {
              response += `${index + 1}. ${book.title}\n`;
              response += `   By: ${book.author || 'Unknown'}\n`;
              if (book.category) response += `   📁 ${book.category}\n`;
              if (book.average_rating && book.rating_count > 0) {
                response += `   ⭐ ${parseFloat(book.average_rating).toFixed(1)} (${book.rating_count} reviews)\n`;
              }
              const status = book.status === 'Available' ? '✅' : '❌';
              response += `   ${status} ${book.status || book.availability_status}\n`;
              response += `\n`;
            });
            
            toolUsed = userId ? 'recommend_books' : 'get_popular_books';
          } else {
            response = `💡 I can recommend books based on:\n\n• Your borrowing history\n• Popular titles\n• Highest-rated books\n• Recently added\n\nWhat would you like to see?`;
          }
          break;

        case 'researchPapers':
          const paperQuery = this.extractSearchQuery(message);
          
          // Check if user wants recommendations (suggest, recommend)
          const wantsRecommendations = /\b(suggest|recommend|recommendation)\b/i.test(message);
          
          // Check if query is just generic terms like "research paper"
          const isGenericQuery = paperQuery && /^(research\s*paper|paper|research)$/i.test(paperQuery.trim());
          
          console.log(`📄 Research Papers Intent - Query: "${paperQuery}", Wants Recs: ${wantsRecommendations}, Generic: ${isGenericQuery}, UserId: ${userId}`);
          
          if (wantsRecommendations && (!paperQuery || paperQuery.length < 3 || isGenericQuery)) {
            // User wants research paper recommendations
            console.log('📄 Calling recommend_research_papers...');
            const paperRecResult = await executeTool('recommend_research_papers', { 
              user_id: userId, 
              limit: 8 
            });
            
            console.log('📄 Recommendation Result:', paperRecResult);
            
            if (paperRecResult.success && paperRecResult.papers && paperRecResult.papers.length > 0) {
              response = `📄 Recommended Research Papers:\n\n`;
              
              paperRecResult.papers.forEach((paper, index) => {
                response += `${index + 1}. ${paper.title}\n`;
                if (paper.author) response += `   By: ${paper.author}\n`;
                if (paper.publication_year) response += `   📅 ${paper.publication_year}\n`;
                if (paper.category) response += `   🏛️ ${paper.category}\n`;
                if (paper.average_rating && paper.rating_count > 0) {
                  response += `   ⭐ ${parseFloat(paper.average_rating).toFixed(1)} (${paper.rating_count} reviews)\n`;
                }
                const status = paper.status === 'Available' ? '✅' : '❌';
                response += `   ${status} ${paper.availability_status}\n\n`;
              });
              
              toolUsed = 'recommend_research_papers';
            } else {
              response = `📄 Research Paper Recommendations\n\nI can suggest papers based on:\n• Your department\n• Your borrowing history\n• Recent publications\n• Popular papers\n\nTell me a topic or keyword to find relevant papers!`;
            }
          } else if (!paperQuery || paperQuery.length < 2 || isGenericQuery) {
            response = `📄 Research Papers\n\nProvide:\n• Paper title\n• Author name\n• Keywords/topic\n• Department\n\nWhat are you researching?`;
          } else {
            // Search with enhanced intelligent matching
            const paperResult = await executeTool('search_research_papers', { query: paperQuery, limit: 8 });
            
            if (paperResult.success && paperResult.papers && paperResult.papers.length > 0) {
              response = `📄 Found ${paperResult.count} research paper${paperResult.count > 1 ? 's' : ''}:\n\n`;
              
              paperResult.papers.forEach((paper, index) => {
                response += `${index + 1}. ${paper.title}\n`;
                if (paper.author) response += `   By: ${paper.author}\n`;
                if (paper.publication_year) response += `   📅 ${paper.publication_year}\n`;
                if (paper.category) response += `   🏛️ ${paper.category}\n`;
                if (paper.average_rating && paper.rating_count > 0) {
                  response += `   ⭐ ${parseFloat(paper.average_rating).toFixed(1)} (${paper.rating_count} reviews)\n`;
                }
                const status = paper.status === 'Available' ? '✅' : '❌';
                response += `   ${status} ${paper.availability_status}\n\n`;
              });
              
              response += `💡 Smart search found these matching your query!`;
              toolUsed = 'search_research_papers';
            } else {
              response = `No papers found for "${paperQuery}" 😕\n\nTry:\n✓ Different keywords\n✓ Author name\n✓ Department name\n✓ Broader terms\n\nSearch handles variations automatically!`;
            }
          }
          break;

        case 'rules':
        case 'faq':
          // Get library rules or FAQs
          const faqResult = await executeTool('get_faqs', { category: 'all' });
          
          if (faqResult.success && faqResult.faqs && faqResult.faqs.length > 0) {
            response = `❓ Frequently Asked Questions:\n\n`;
            
            // Show first 5 FAQs
            faqResult.faqs.slice(0, 5).forEach((faq, index) => {
              response += `Q: ${faq.question}\n`;
              response += `A: ${faq.answer}\n\n`;
            });
            
            if (faqResult.faqs.length > 5) {
              response += `...${faqResult.faqs.length - 5} more available`;
            }
            
            toolUsed = 'get_faqs';
          } else {
            // Fallback to library rules
            const rulesResult = await executeTool('get_library_rules', {});
            
            if (rulesResult.success && rulesResult.rules && rulesResult.rules.length > 0) {
              response = `📋 Library Rules:\n\n`;
              
              rulesResult.rules.slice(0, 5).forEach((rule, index) => {
                response += `${index + 1}. ${rule.rule_title}\n`;
                response += `${rule.rule_description}\n\n`;
              });
              
              toolUsed = 'get_library_rules';
            } else {
              response = `For library rules and FAQs, please visit the Help section or contact the library desk.`;
            }
          }
          break;

        case 'help':
          response = `🔍 How can I help?\n\n📚 Books\n• Search & check availability\n• Get recommendations\n\n📄 Research Papers\n• Find academic papers\n\n🕐 Library Info\n• Hours & policies\n\n📖 Transactions\n• Borrow & return\n• Check penalties\n\nWhat do you need?`;
          break;

        default:
          // Try to determine if it's a book search
          if (message.length > 5 && this.looksLikeBookSearch(message)) {
            const searchQuery = this.extractSearchQuery(message);
            const result = await executeTool('search_books', { query: searchQuery, limit: 5 });
            
            if (result.success && result.books && result.books.length > 0) {
              response = `📚 Found:\n\n`;
              
              result.books.slice(0, 3).forEach((book, index) => {
                response += `${index + 1}. ${book.title}\n`;
                response += `   By: ${book.author || 'Unknown'}\n`;
                response += `   ${book.status === 'Available' ? '✅ Available' : '❌ Not Available'}\n\n`;
              });
              
              toolUsed = 'search_books';
            } else {
              response = this.responses.default();
            }
          } else {
            response = this.responses.default();
          }
      }

      return {
        success: true,
        message: response,
        intent: intent,
        toolUsed: toolUsed
      };

    } catch (error) {
      console.error('Error processing message:', error);
      return {
        success: false,
        message: "I'm sorry, I encountered an error processing your request. Please try again or rephrase your question.",
        error: error.message
      };
    }
  }

  /**
   * Extract search query from message by removing common words
   */
  extractSearchQuery(message) {
    const stopWords = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'will', 'would',
      'should', 'may', 'might', 'must', 'for', 'about', 'find', 'search',
      'looking', 'look', 'by', 'called', 'named', 'please', 'help', 'me', 'i', 
      'want', 'need', 'where', 'what', 'when', 'who', 'how', 'any', 'some', 
      'this', 'that', 'these', 'those', 'you', 'got', 'there',
      'suggest', 'recommend', 'recommendation'
      // Note: removed 'book', 'books', 'author', 'title', 'research', 'paper' 
      // as these are meaningful search terms
    ]);

    // Remove punctuation and convert to lowercase
    let cleaned = message.toLowerCase().replace(/[^\w\s]/g, ' ');
    
    // Split into words and filter stop words
    const words = cleaned.split(/\s+/).filter(word => 
      word.length > 2 && !stopWords.has(word)
    );

    return words.join(' ').trim();
  }

  /**
   * Determine if message looks like a book search query
   */
  looksLikeBookSearch(message) {
    const bookIndicators = /\b(novel|fiction|story|biography|textbook|guide|manual|handbook)\b/i;
    const hasCapitalizedWords = /[A-Z][a-z]+\s+[A-Z][a-z]+/.test(message);
    const hasQuotes = /["']/.test(message);
    
    return bookIndicators.test(message) || hasCapitalizedWords || hasQuotes;
  }
}

module.exports = new RuleBasedChatbot();
