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
    this.defaultModel = process.env.OLLAMA_MODEL || 'llama3.2:3b';
    this.available = false; // indicates whether Ollama is reachable
    this.conversationHistory = new Map();
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
  async chat(message, sessionId, tools = [], context = {}, options = {}) {
    try {
      const saveHistory = options.saveHistory !== false;
      const maxHistory = options.maxHistory || 20;

      // Get or initialize conversation history
      if (!this.conversationHistory.has(sessionId)) {
        this.conversationHistory.set(sessionId, []);
      }

      const storedHistory = this.conversationHistory.get(sessionId) || [];
      // Build messages array from stored history. Do NOT mutate storedHistory unless saveHistory is true.
      const messagesFromHistory = Array.isArray(storedHistory) ? [...storedHistory] : [];

      // If saving history, append the user message to storedHistory as well
      if (saveHistory) {
        storedHistory.push({ role: 'user', content: message });
      }

      // Messages to send include system prompt + stored history (copied) + current user message
      const history = [...messagesFromHistory, { role: 'user', content: message }];

      // Build system prompt with context
      const systemPrompt = this.buildSystemPrompt(context);

      // Prepare messages with system prompt
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history
      ];

      // Make chat request with tools - optimized for speed
      const response = await this.ollama.chat({
        model: this.defaultModel,
        messages: messages,
        tools: tools.length > 0 ? tools : undefined,
        stream: false,
        options: {
          temperature: 0.7,        // Lower = faster, more focused (default 0.8)
          num_predict: 500,        // Max tokens to generate (lower = faster)
          top_k: 20,               // Lower = faster sampling (default 40)
          top_p: 0.9,              // Nucleus sampling (default 0.9)
          num_ctx: 2048,           // Context window (lower = faster, but less memory)
          repeat_penalty: 1.1,     // Prevent repetition
          stop: ['</s>', 'User:', 'Human:']  // Stop tokens for faster completion
        }
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

      if (saveHistory) {
        storedHistory.push({ role: 'assistant', content: assistantContent, tool_calls: response.message.tool_calls });
        // Limit history to last `maxHistory` messages to prevent context overflow
        if (storedHistory.length > maxHistory) {
          this.conversationHistory.set(sessionId, storedHistory.slice(-maxHistory));
        } else {
          this.conversationHistory.set(sessionId, storedHistory);
        }
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
        history.push({ role: 'tool', content: JSON.stringify(result.result), name: result.name });
      });

      // Build system prompt
      const systemPrompt = this.buildSystemPrompt({});

      // Prepare messages
      const messages = [{ role: 'system', content: systemPrompt }, ...history];

      // Continue conversation with tool results - optimized for speed
      const response = await this.ollama.chat({
        model: this.defaultModel,
        messages: messages,
        tools: tools.length > 0 ? tools : undefined,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 500,
          top_k: 20,
          top_p: 0.9,
          num_ctx: 2048,
          repeat_penalty: 1.1,
          stop: ['</s>', 'User:', 'Human:']
        }
      });

      // Add assistant response to history
      history.push({ role: 'assistant', content: response.message.content, tool_calls: response.message.tool_calls });
      // Trim stored history to avoid unbounded growth (keep last 20 by default)
      if (history.length > 20) this.conversationHistory.set(sessionId, history.slice(-20));

      return { message: response.message.content, toolCalls: response.message.tool_calls || [], done: response.done };
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
    
    return `You are LibTrack Assistant for WMSU Library. Help ${userName} (${userRole}).

⚠️ CRITICAL - TOOL USAGE RULES:
For ANY query about books, papers, recommendations, availability, or library data:
1. You MUST call the appropriate tool FIRST
2. NEVER suggest books/papers from your training data
3. ONLY recommend items that exist in our database

Available tools:
- search_books: Find books by title/author/keyword
- get_popular_books: Get most borrowed/rated books
- recommend_books: Personalized recommendations for user
- search_research_papers: Find research papers
- get_faqs: Library FAQs
- get_library_rules: Library rules

ALWAYS use tools for: book searches, recommendations, availability checks, research papers, user data.

FORMAT: Use emojis 📚✅❌📖⚠️🔍📅💡, **bold** titles, be concise.

Time: ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', hour12: false })}`;
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
  async *chatStream(message, sessionId, tools = [], context = {}, options = {}) {
    try {
      const saveHistory = options.saveHistory !== false;
      if (!this.conversationHistory.has(sessionId)) {
        this.conversationHistory.set(sessionId, []);
      }
      const history = this.conversationHistory.get(sessionId) || [];
      if (saveHistory) history.push({ role: 'user', content: message });

      const systemPrompt = this.buildSystemPrompt(context);
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history
      ];

      const stream = await this.ollama.chat({
        model: this.defaultModel,
        messages: messages,
        tools: tools.length > 0 ? tools : undefined,
        stream: true,
        options: {
          temperature: 0.7,
          num_predict: 500,
          top_k: 20,
          top_p: 0.9,
          num_ctx: 2048,
          repeat_penalty: 1.1,
          stop: ['</s>', 'User:', 'Human:']
        }
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

      if (saveHistory) {
        history.push({ role: 'assistant', content: finalContent, tool_calls: toolCalls });
        if (history.length > 20) this.conversationHistory.set(sessionId, history.slice(-20));
      }

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
