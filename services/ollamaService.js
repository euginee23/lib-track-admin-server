const { Ollama } = require('ollama');
const axios = require('axios');

/**
 * Ollama Service
 * Handles all interactions with the Ollama API for AI-powered chatbot functionality
 */

class OllamaService {
  constructor() {
    this.ollama = new Ollama({ 
      host: process.env.OLLAMA_HOST || 'http://localhost:11434' 
    });
    this.defaultModel = process.env.OLLAMA_MODEL || 'llama3.2';
    this.available = false; // indicates whether Ollama is reachable
    this.conversationHistory = new Map(); // Store conversation history per session
  }

  /**
   * Initialize and check if Ollama is available
   */
  async initialize() {
    const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const serverPort = process.env.PORT || '4000';

    // Guard: common misconfiguration where frontend/server OLLAMA_HOST points to the app server
    try {
      const normalized = String(host).toLowerCase();
      if (normalized.includes(`:${serverPort}`) || normalized.endsWith(`:${serverPort}`) || normalized === `http://localhost:${serverPort}`) {
        console.error(`❌ OLLAMA_HOST appears to point to this app server (port ${serverPort}). This is a misconfiguration.`);
        console.error(`Please set OLLAMA_HOST to the Ollama server (default: http://localhost:11434) and restart.`);
        this.available = false;
        return false;
      }
    } catch (e) {
      // ignore parsing errors and proceed
    }
    const maxRetries = 3;
    let lastErr = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // lightweight HTTP check to the Ollama HTTP API (root endpoint)
        const pingUrl = `${host.replace(/\/$/, '')}/`;
        const resp = await axios.get(pingUrl, { timeout: 3000 });
        if (resp && resp.status >= 200 && resp.status < 400) {
          // still attempt to use the Ollama client to list models for richer info
          try {
            const models = await this.ollama.list();
            const names = (models && models.models) ? models.models.map(m => m.name) : [];
            console.log('✅ Ollama connected. Available models:', names);
          } catch (e) {
            console.log('⚠️ Ollama HTTP ok but client list failed (falling back to HTTP response)');
          }
          this.available = true;
          return true;
        }
      } catch (error) {
        lastErr = error;
        console.warn(`Attempt ${attempt} - Ollama ping failed: ${error.message}`);
        // small backoff
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }

    console.error('❌ Ollama connection failed:', lastErr ? lastErr.message : 'unknown error');
    console.error('Please ensure Ollama is installed and running: `ollama serve`');
    this.available = false;
    return false;
  }

  /**
   * List available models
   */
  async listModels() {
    if (!this.available) {
      return [];
    }
    try {
      const response = await this.ollama.list();
      return response.models || [];
    } catch (error) {
      console.error('Error listing models:', error.message || error);
      // if listing fails, mark unavailable to avoid repeated errors
      this.available = false;
      throw new Error('Failed to fetch available models');
    }
  }

  /**
   * Chat with Ollama using tools/function calling
   * @param {string} message - User's message
   * @param {string} sessionId - Unique session identifier
   * @param {Array} tools - Available tools for function calling
   * @param {Object} context - Additional context (user info, etc.)
   */
  async chat(message, sessionId, tools = [], context = {}) {
    try {
      // Get or initialize conversation history
      if (!this.conversationHistory.has(sessionId)) {
        this.conversationHistory.set(sessionId, []);
      }
      
      const history = this.conversationHistory.get(sessionId);
      
      // Add user message to history
      history.push({
        role: 'user',
        content: message
      });

      // Build system prompt with context
      const systemPrompt = this.buildSystemPrompt(context);

      // Prepare messages with system prompt
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history
      ];

      // Make chat request with tools
      const response = await this.ollama.chat({
        model: this.defaultModel,
        messages: messages,
        tools: tools.length > 0 ? tools : undefined,
        stream: false
      });

      // Add assistant response to history
      // If the model provided tool calls, normalize the assistant content
      let assistantContent = response.message.content;
      try {
        const tcs = response.message.tool_calls;
        if (tcs && Array.isArray(tcs) && tcs.length > 0) {
          const first = tcs[0];
          const name = first.function && first.function.name ? first.function.name : (first.name || '');
          const params = (first.function && first.function.arguments) ? first.function.arguments : (first.arguments || {});
          assistantContent = JSON.stringify({ name: name, parameters: params });
        }
      } catch (e) {
        // fallback to raw content on any error
        assistantContent = response.message.content;
      }

      history.push({
        role: 'assistant',
        content: assistantContent,
        tool_calls: response.message.tool_calls
      });

      // Limit history to last 20 messages to prevent context overflow
      if (history.length > 20) {
        this.conversationHistory.set(sessionId, history.slice(-20));
      }

      return {
        message: response.message.content,
        toolCalls: response.message.tool_calls || [],
        done: response.done
      };
    } catch (error) {
      console.error('Error in Ollama chat:', error);
      throw new Error('Failed to process chat request');
    }
  }

  /**
   * Execute tool calls and continue conversation
   * @param {string} sessionId - Session identifier
   * @param {Array} toolResults - Results from executed tools
   * @param {Array} tools - Available tools
   */
  async continueWithToolResults(sessionId, toolResults, tools = []) {
    try {
      const history = this.conversationHistory.get(sessionId) || [];
      
      // Add tool results to history
      toolResults.forEach(result => {
        history.push({
          role: 'tool',
          content: JSON.stringify(result.result),
          name: result.name
        });
      });

      // Build system prompt
      const systemPrompt = this.buildSystemPrompt({});

      // Prepare messages
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history
      ];

      // Continue conversation with tool results
      const response = await this.ollama.chat({
        model: this.defaultModel,
        messages: messages,
        tools: tools.length > 0 ? tools : undefined,
        stream: false
      });

      // Add assistant response to history
      history.push({
        role: 'assistant',
        content: response.message.content,
        tool_calls: response.message.tool_calls
      });

      return {
        message: response.message.content,
        toolCalls: response.message.tool_calls || [],
        done: response.done
      };
    } catch (error) {
      console.error('Error continuing with tool results:', error);
      throw new Error('Failed to process tool results');
    }
  }

  /**
   * Build system prompt with context
   */
  buildSystemPrompt(context) {
    const userName = context.userName || 'User';
    const userRole = context.userRole || 'student';
    // Compute Philippines (Asia/Manila) local time for accurate greetings
    let manilaTime = null;
    try {
      manilaTime = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', hour12: false });
    } catch (e) {
      manilaTime = new Date().toISOString();
    }
    
    return `You are LibTrack Assistant, an AI-powered virtual library assistant for Western Mindanao State University Library System.

Your role is to help ${userName} (${userRole}) with library-related questions and tasks.

Core Capabilities:
1. **General Library Knowledge** - You have extensive knowledge about:
   - Library systems, policies, and best practices
   - General borrowing/returning procedures
   - Common library rules (quiet hours, late fees, loan periods, etc.)
   - Library etiquette and academic research tips
   - Study tips and how to use library resources effectively

2. **WMSU-Specific Information** - Use the database tools to get real-time data about:
   - Book availability and location in WMSU library
   - Specific research papers in the collection
   - User's personal borrowing history and transactions
   - WMSU library rules and FAQs
   - Current popular books at WMSU
   - User's penalties or fines

⚠️ **CRITICAL RULE - Book & Research Paper Queries:**
When a user asks about:
- Specific books, book titles, authors, or ISBNs
- Book recommendations, suggestions, or "random book"
- Book availability, location, or status
- Popular books, new arrivals, or categories
- Research papers or theses

You MUST:
✅ ALWAYS use the database tools (search_books, get_popular_books, recommend_books, search_research_papers)
✅ ONLY suggest books that exist in the WMSU library database
✅ If the database returns no results, inform the user that the book is not in our collection

❌ NEVER:
❌ Suggest books from your general knowledge that might not exist in WMSU library
❌ Make up book recommendations without checking the database first
❌ Answer book availability questions without using the tools

If you don't have tools available for a book query, tell the user you need to check the database first.

FORMATTING GUIDELINES (VERY IMPORTANT):
- Use **bold** for emphasis on important titles, book names, and key points
- Use emojis appropriately to make responses engaging:
  📚 for books and reading
  ✅ for available/success
  ❌ for unavailable/errors
  📖 for general library info
  ⚠️ for warnings or important notes
  🔍 for searching
  📅 for dates and deadlines
  💡 for tips and suggestions
  ⭐ for recommendations or featured items
  📝 for rules and procedures
  🎓 for academic/research related
  
- Structure responses with:
  • Use bullet points (•) for lists
  • Use line breaks for readability
  • Use numbered lists (1., 2., 3.) for steps
  • Add section headers when appropriate

- When showing book information, format like:
  📚 **"Book Title"** by Author Name
  ✅ Status: Available
  📍 Location: [Shelf info]

- Keep responses conversational but well-organized
- Use short paragraphs (2-3 sentences max)
- Add relevant emojis at the start of important statements

RESPONSE STRUCTURE:
1. Start with a friendly greeting or acknowledgment
2. Provide the main answer with proper formatting
3. Add helpful tips or next steps if relevant
4. End with an offer to help further

Examples of well-formatted responses:

For book search:
"🔍 I found several books matching your query!

📚 **"The Great Gatsby"** by F. Scott Fitzgerald
✅ Status: Available
📍 Location: Fiction Section, Shelf A-12

📚 **"1984"** by George Orwell  
❌ Status: Currently Borrowed
📅 Expected return: Dec 5, 2025

💡 **Tip:** You can reserve the unavailable book from your account!

Need help with anything else? 😊"

For library rules:
"📝 **Library Rules & Guidelines**

Here are the key points:

• 🤫 Maintain quiet atmosphere in reading areas
• 📱 Phones on silent mode only
• ⏰ Loan period: 7 days for students, 14 days for faculty
• 💰 Late fees: ₱10 per day for overdue books
• 🔖 Maximum 3 books can be borrowed at once

⚠️ **Important:** Repeated violations may result in suspension of library privileges.

Would you like to know more about any specific rule?"

Server Manila time: ${manilaTime}

TIME & GREETING RULES:
- Always use the Philippines local time (Asia/Manila) when greeting users.
- Greeting mapping: 05:00-11:59 → "Good morning"; 12:00-17:59 → "Good afternoon"; 18:00-04:59 → "Good evening".
- If Manila time indicates afternoon, do NOT greet with "Good morning"; choose the appropriate greeting.

Current time (UTC): ${new Date().toISOString()}`;
  }

  /**
   * Clear conversation history for a session
   */
  clearHistory(sessionId) {
    this.conversationHistory.delete(sessionId);
  }

  /**
   * Get conversation history for a session
   */
  getHistory(sessionId) {
    return this.conversationHistory.get(sessionId) || [];
  }

  /**
   * Generate embeddings for semantic search
   */
  async generateEmbeddings(text, model = 'nomic-embed-text') {
    try {
      const response = await this.ollama.embeddings({
        model: model,
        prompt: text
      });
      return response.embedding;
    } catch (error) {
      console.error('Error generating embeddings:', error);
      throw new Error('Failed to generate embeddings');
    }
  }

  /**
   * Stream chat responses (for real-time streaming to frontend)
   */
  async *chatStream(message, sessionId, tools = [], context = {}) {
    try {
      if (!this.conversationHistory.has(sessionId)) {
        this.conversationHistory.set(sessionId, []);
      }
      
      const history = this.conversationHistory.get(sessionId);
      history.push({ role: 'user', content: message });

      const systemPrompt = this.buildSystemPrompt(context);
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history
      ];

      const stream = await this.ollama.chat({
        model: this.defaultModel,
        messages: messages,
        tools: tools.length > 0 ? tools : undefined,
        stream: true
      });

      let fullContent = '';
      let toolCalls = [];

      for await (const chunk of stream) {
        if (chunk.message.content) {
          fullContent += chunk.message.content;
          yield { type: 'content', content: chunk.message.content };
        }
        if (chunk.message.tool_calls) {
          toolCalls = chunk.message.tool_calls;
        }
      }

      // Add complete response to history
      // If tool calls were emitted, normalize stored assistant content to structured JSON
      let finalContent = fullContent;
      try {
        if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
          const first = toolCalls[0];
          const name = first.function && first.function.name ? first.function.name : (first.name || '');
          const params = (first.function && first.function.arguments) ? first.function.arguments : (first.arguments || {});
          finalContent = JSON.stringify({ name: name, parameters: params });
        }
      } catch (e) {
        finalContent = fullContent;
      }

      history.push({
        role: 'assistant',
        content: finalContent,
        tool_calls: toolCalls
      });

      yield { type: 'done', toolCalls };
    } catch (error) {
      console.error('Error in streaming chat:', error);
      yield { type: 'error', error: error.message };
    }
  }
}

// Singleton instance
const ollamaService = new OllamaService();

module.exports = ollamaService;
