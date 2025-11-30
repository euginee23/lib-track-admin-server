const ollamaService = require('../services/ollamaService');
const { toolDefinitions, executeTool } = require('../services/chatbotTools');

/**
 * AI Router - Orchestrates the chatbot conversation flow
 * Handles message processing, tool calling, and response generation
 */

class AIRouter {
  constructor() {
    this.maxToolIterations = 5; // Prevent infinite loops
  }

  // Heuristic: decide whether message is simple and should use model-only fast path
  isSimpleMessage(message = '') {
    if (!message || typeof message !== 'string') return false;
    // Too short or clearly conversational (not a data/task request)
    if (message.length < 80) return true;
    // If message doesn't include any trigger words for tools, consider simple
    const heavyTriggers = ['search', 'find', 'where', 'availability', 'recommend', 'reserve', 'borrow', 'return', 'paper', 'research', 'isbn', 'transaction', 'my', 'due', 'overdue', 'fine'];
    const m = message.toLowerCase();
    for (const t of heavyTriggers) if (m.includes(t)) return false;
    return true;
  }

  truncateMessage(text = '', max = 1200) {
    if (!text || typeof text !== 'string') return text;
    if (text.length <= max) return text;
    return text.slice(0, max - 3) + '...';
  }

  /**
   * Heuristic to decide whether to expose tools for a message
   * Returns true when the message appears to require real-time or user-specific data
   * CRITICAL: ANY book/paper query MUST use tools - never let AI suggest non-existent items
   */
  needsTools(message = '', context = {}) {
    if (!message || typeof message !== 'string') return false;
    const m = message.toLowerCase();

    // ALWAYS expose tools for any book/paper-related queries
    const bookTriggers = [
      'book', 'books', 'title', 'author', 'isbn', 'recommend', 'recommendation', 'suggest', 'suggestion',
      'random', 'popular', 'best', 'top', 'new', 'recent', 'available', 'availability',
      'search', 'find', 'looking for', 'where is', 'location', 'shelf',
      'research', 'paper', 'thesis', 'study', 'publication',
      'categories', 'category', 'genre', 'subject', 'topic',
      'fiction', 'non-fiction', 'novel', 'textbook'
    ];

    for (const trig of bookTriggers) {
      if (m.includes(trig)) return true;
    }

    // User account/transaction queries
    const accountTriggers = [
      'my books', 'my borrowings', 'borrowed', 'transaction', 'transactions',
      'overdue', 'due date', 'fine', 'penalty', 'history'
    ];

    for (const trig of accountTriggers) {
      if (m.includes(trig)) return true;
    }

    // If user context references userId and asks about their account, use tools
    if (context && context.userId) {
      const personalTriggers = ['my', "i have", "do i", "me"];
      for (const t of personalTriggers) if (m.includes(t)) return true;
    }

    return false;
  }

  /**
   * Process a user message and generate a response
   * @param {string} message - User's message
   * @param {string} sessionId - Unique session identifier
   * @param {Object} context - Additional context (user info, etc.)
   */
  async processMessage(message, sessionId, context = {}) {
    try {
      // Quick heuristic: if the user explicitly asks for a research paper, run the research-papers
      // tool directly to avoid the model choosing the wrong tool (e.g., search_books).
      const researchIntent = (m => {
        if (!m) return false;
        const mm = m.toLowerCase();
        return /\bresearch paper\b|\bresearch papers\b|\bresearch\b|\bpaper by\b|\bpaper titled\b|\bprovide a paper\b|\bthesis\b|\bpublication\b|\bjournal\b|\bconference\b|\bproceedings\b|\bpaper\b/i.test(mm);
      })(message);
      if (researchIntent) {
        try {
          // Extract the author's name if the user used 'by <name>' syntax to avoid model rewording
          let authorQuery = null;
          const byMatch = message.match(/by\s+(.+)$/i);
          if (byMatch && byMatch[1]) {
            authorQuery = byMatch[1].trim();
          } else {
            // try to extract phrases like 'paper by X' or 'find paper X'
            const genericMatch = message.match(/(?:paper|research paper|publication)\s+(?:titled\s+)?"?([^\n"]+)"?/i);
            if (genericMatch && genericMatch[1]) authorQuery = genericMatch[1].trim();
          }
          const queryToUse = authorQuery || message;

          const papersRes = await executeTool('search_research_papers', { query: queryToUse, limit: 20 });
          if (papersRes && papersRes.success && Array.isArray(papersRes.papers) && papersRes.papers.length > 0) {
            const formatted = this.formatToolResults([{ name: 'search_research_papers', result: papersRes }], '');
            return {
              success: true,
              message: formatted || `🔎 I found the following research papers for "${queryToUse}".`,
              toolCallsExecuted: 1,
              iterations: 0
            };
          }

          // Deterministic no-results message: avoid model-led corrections or suggestions that change the name.
          return {
            success: true,
            message: `🔎 I searched the WMSU catalog for exact matches for "${queryToUse}" but found no results. Would you like me to try alternate spellings or search broader keywords?`,
            toolCallsExecuted: 1,
            iterations: 0
          };
        } catch (e) {
          console.warn('Direct research tool lookup failed:', e && e.message);
          // fall through to normal flow if execution fails
        }
      }

      let iteration = 0;
      let currentResponse;
      let allToolResults = [];

      // Decide whether to expose tools based on heuristics
      const exposeTools = this.needsTools(message, context);
      const simple = this.isSimpleMessage(message);
      if (exposeTools) console.log('🔧 Exposing tools for this request');
      else if (simple) console.log('🔍 Simple message - fast path (no tools)');
      else console.log('🔍 Handling with model knowledge (no tools)');

      // Fast-path for simple messages: avoid heavy tool flows and memory usage
      if (!exposeTools && simple) {
        try {
          currentResponse = await ollamaService.chat(message, sessionId, [], context, { saveHistory: false });

          // Truncate lengthy outputs for simple, non-tool responses to avoid oversharing
          const maxLen = 1000;
          let out = currentResponse && currentResponse.message ? String(currentResponse.message) : '';
          out = this.truncateMessage(out, maxLen);
          return {
            success: true,
            message: out,
            toolCallsExecuted: 0,
            iterations: 0
          };
        } catch (e) {
          console.warn('Fast-path chat failed, falling back to normal flow:', e && e.message);
        }
      }

      // Initial chat (normal flow)
      currentResponse = await ollamaService.chat(
        message,
        sessionId,
        exposeTools ? toolDefinitions : [],
        context
      );

      // Handle tool calls if any
      while (currentResponse.toolCalls && currentResponse.toolCalls.length > 0 && iteration < this.maxToolIterations) {
        iteration++;
        console.log(`🔧 Iteration ${iteration}: Processing ${currentResponse.toolCalls.length} tool calls`);

        // Execute all tool calls in parallel
        const toolPromises = currentResponse.toolCalls.map(async (toolCall) => {
          try {
            console.log(`Executing tool: ${toolCall.function.name}`);
            const result = await executeTool(
              toolCall.function.name,
              toolCall.function.arguments
            );
            
            return {
              name: toolCall.function.name,
              result: result
            };
          } catch (error) {
            console.error(`Error executing tool ${toolCall.function.name}:`, error);
            return {
              name: toolCall.function.name,
              result: { success: false, error: error.message }
            };
          }
        });

        const toolResults = await Promise.all(toolPromises);
        allToolResults.push(...toolResults);

        // Continue conversation with tool results
        currentResponse = await ollamaService.continueWithToolResults(
          sessionId,
          toolResults,
          toolDefinitions
        );
      }

        // If tools were executed, attempt to create a clean, server-side formatted
        // response (Markdown/plain text with explicit newlines) so the frontend
        // displays readable, line-broken output even if the model output is compact.
        if (allToolResults && allToolResults.length > 0) {
          // If a search tool returned zero results, DO NOT fall back to the model's
          // free-form message (which may invent titles). Instead, try offering
          // popular books from the DB or a clear "no results" message.
          const zeroBookSearch = allToolResults.find(r => r.name === 'search_books' && r.result && (r.result.count === 0 || (Array.isArray(r.result.books) && r.result.books.length === 0)));
          const zeroResearchSearch = allToolResults.find(r => r.name === 'search_research_papers' && r.result && (r.result.count === 0 || (Array.isArray(r.result.papers) && r.result.papers.length === 0)));

          if (zeroBookSearch || zeroResearchSearch) {
            // Try to fetch popular books from DB to provide real suggestions instead
            try {
              const popular = await executeTool('get_popular_books', { type: 'most_borrowed', limit: 6 });
              if (popular && popular.success && Array.isArray(popular.books) && popular.books.length > 0) {
                allToolResults.push({ name: 'get_popular_books', result: popular });
              }
            } catch (e) {
              // ignore fallback failure
              console.warn('Failed to fetch popular books fallback:', e && e.message);
            }

            const formattedFallback = this.formatToolResults(allToolResults, '');
            if (formattedFallback) {
              return {
                success: true,
                message: formattedFallback,
                toolCallsExecuted: allToolResults.length,
                iterations: iteration
              };
            }

            // If still nothing, return a deterministic "no results" message
            return {
              success: true,
              message: "🔎 I couldn't find any matching items in the WMSU catalog. Would you like me to try different keywords or view popular books instead?",
              toolCallsExecuted: allToolResults.length,
              iterations: iteration
            };
          }

          const formatted = this.formatToolResults(allToolResults, '');
          if (formatted) {
            return {
              success: true,
              message: formatted,
              toolCallsExecuted: allToolResults.length,
              iterations: iteration
            };
          }
        }
        // If no tools were executed or formatting produced nothing, return the model message
        return {
          success: true,
          message: currentResponse.message,
          toolCallsExecuted: allToolResults.length,
          iterations: iteration
        };
    } catch (error) {
      console.error('Error in AI Router:', error);
      // Do not automatically clear history here; history trimming is handled by ollamaService (maxHistory)
      return {
        success: false,
        error: error.message,
        message: "I apologize, but I encountered an error processing your request. Please try again or rephrase your question."
      };
    }
  }

  /**
   * Format tool results into a readable multiline string.
   * Returns null when no special formatting was applied so callers can fall back.
   */
  formatToolResults(toolResults = [], fallbackModelMessage = '') {
    try {
      // Look for common book-result tools and format them predictably
      for (const tr of toolResults) {
        const name = tr.name;
        const res = tr.result || {};

        if (!res || !res.success) continue;

        // search_books / get_popular_books / recommend_books -> res.books or res.recommendations
        if (name === 'search_books' && Array.isArray(res.books) && res.books.length > 0) {
          // Collapse duplicate physical copies into unique titles for clearer output.
          const map = new Map();
          for (const b of res.books) {
            const title = (b.title || b.book_title || 'Unknown Title').trim();
            const author = (b.author || 'Unknown Author').trim();
            const key = `${title}||${author}`;
            const location = b.book_number || b.shelf_location || b.batch_registration_key || null;
            const status = b.availability_status || b.status || 'Unknown';
            const pubYear = b.publication_year || b.book_year || null;

            if (!map.has(key)) {
              map.set(key, {
                title,
                author,
                statusCounts: { available: 0, not_available: 0 },
                locations: new Set(),
                publication_year: pubYear
              });
            }

            const entry = map.get(key);
            if (status && status.toLowerCase().includes('available')) entry.statusCounts.available++;
            else entry.statusCounts.not_available++;
            if (location) entry.locations.add(location);
            if (!entry.publication_year && pubYear) entry.publication_year = pubYear;
          }

          const lines = [];
          lines.push('🔍 **Search Results**\n');
          for (const [_, e] of map) {
            const locArr = Array.from(e.locations).slice(0, 6);
            const copies = e.statusCounts.available + e.statusCounts.not_available;
            lines.push(`📚 **${e.title}** by ${e.author}`);
            if (e.publication_year) lines.push(`📅 Year: ${e.publication_year}`);
            lines.push(`✅ Copies: ${copies} • Available: ${e.statusCounts.available}`);
            if (locArr.length > 0) lines.push(`📍 Locations: ${locArr.join(', ')}`);
            lines.push('');
          }

          return lines.join('\n');
        }

        if (name === 'get_popular_books' && Array.isArray(res.books) && res.books.length > 0) {
          const lines = [];
          lines.push('⭐ **Recommended Popular Books**\n');
          for (const b of res.books) {
            const title = b.book_title || b.title || 'Unknown Title';
            const author = b.author || 'Unknown Author';
            const status = b.status || 'Unknown';
            const borrowCount = b.borrow_count != null ? `(${b.borrow_count} borrowings)` : '';
            lines.push(`📚 **${title}** by ${author} ${borrowCount}`);
            lines.push(`✅ Status: ${status}`);
            if (b.category) lines.push(`📂 Category: ${b.category}`);
            lines.push('');
          }
          return lines.join('\n');
        }

        if (name === 'recommend_books' && Array.isArray(res.recommendations) && res.recommendations.length > 0) {
          const lines = [];
          lines.push('💡 **Personalized Recommendations**\n');
          for (const b of res.recommendations) {
            const title = b.title || b.book_title || 'Unknown Title';
            const author = b.author || 'Unknown Author';
            const status = b.status || 'Unknown';
            lines.push(`📚 **${title}** by ${author}`);
            lines.push(`✅ Status: ${status}`);
            if (b.average_rating) lines.push(`⭐ Rating: ${Number(b.average_rating).toFixed(1)} (${b.rating_count || 0} ratings)`);
            lines.push('');
          }
          return lines.join('\n');
        }

        // user borrowed books
        if (name === 'get_user_borrowed_books' && Array.isArray(res.borrowed_books) && res.borrowed_books.length > 0) {
          const lines = [];
          lines.push('📦 **Your Borrowed Books**\n');
          for (const t of res.borrowed_books) {
            const title = t.title || t.book_title || 'Unknown Title';
            const author = t.author || 'Unknown Author';
            const due = t.due_date || t.dueDate || '';
            const status = t.status || '';
            const daysUntil = t.days_until_due != null ? `${t.days_until_due} day(s)` : '';
            lines.push(`📚 **${title}** by ${author}`);
            if (status) lines.push(`✅ Status: ${status}`);
            if (due) lines.push(`📅 Due: ${due} ${daysUntil ? `• ${daysUntil}` : ''}`);
            lines.push('');
          }
          return lines.join('\n');
        }

        // FAQs or rules -> pretty print list
        if (name === 'get_faqs' && Array.isArray(res.faqs)) {
          const lines = [];
          lines.push('📝 **Frequently Asked Questions**\n');
          for (const f of res.faqs) {
            lines.push(`• **${f.question}**`);
            if (f.answer) lines.push(`  - ${f.answer}`);
          }
          return lines.join('\n');
        }

        if (name === 'get_library_rules' && Array.isArray(res.rules)) {
          const lines = [];
          lines.push('📝 **Library Rules & Guidelines**\n');
          for (const r of res.rules) {
            lines.push(`• **${r.rule_title}** - ${r.rule_description}`);
          }
          return lines.join('\n');
        }

        // research paper search results
        if (name === 'search_research_papers' && Array.isArray(res.papers) && res.papers.length > 0) {
          const lines = [];
          lines.push('🔎 **Research Papers Found**\n');
          for (const p of res.papers) {
            const title = p.title || p.research_title || 'Unknown Title';
            // Normalize author fields: could be string, comma-separated, or array under various keys
            const extractAuthors = (obj) => {
              if (!obj) return null;
              // possible keys that may contain author info
              const candidateKeys = ['author', 'authors', 'author_name', 'author_names', 'creators', 'creator', 'research_authors', 'contributors'];
              for (const k of candidateKeys) {
                if (obj[k]) {
                  const v = obj[k];
                  if (Array.isArray(v)) return v.join(', ');
                  if (typeof v === 'string') return v;
                }
              }
              // if obj itself is a string or array
              if (Array.isArray(obj)) return obj.join(', ');
              if (typeof obj === 'string') return obj;
              return null;
            };

            let authors = extractAuthors(p) || 'Unknown Author(s)';
            // Normalize comma-separated author lists that may lack spaces
            if (typeof authors === 'string') {
              authors = authors.replace(/,([^\s])/g, ', $1');
            }
            const status = p.availability_status || p.status || 'Unknown';
            const dept = p.category || p.department_name || '';
            const year = p.publication_year || p.year_publication || '';

            lines.push(`📄 **${title}**`);
            lines.push(`👥 Authors: ${authors}`);
            if (year) lines.push(`📅 Year: ${year}`);
            lines.push(`✅ Status: ${status}`);
            if (dept) lines.push(`🏷️ Department: ${dept}`);
            if (p.research_abstract) lines.push(`📝 Abstract: ${p.research_abstract.substring(0, 300)}${p.research_abstract.length > 300 ? '...' : ''}`);
            lines.push('');
          }
          return lines.join('\n');
        }
      }

      // If nothing matched, return fallbackModelMessage only if it's non-empty.
      return fallbackModelMessage || null;
    } catch (e) {
      console.error('Error formatting tool results:', e);
      return null;
    }
  }

  /**
   * Process a message with streaming response
   * @param {string} message - User's message
   * @param {string} sessionId - Unique session identifier
   * @param {Object} context - Additional context
   * @param {Function} onChunk - Callback for each chunk of response
   */
  async processMessageStream(message, sessionId, context = {}, onChunk) {
    try {
      let iteration = 0;
      let allToolResults = [];
      
      // Decide whether to expose tools for streaming
      const exposeToolsStream = this.needsTools(message, context);
      if (exposeToolsStream) onChunk({ type: 'info', info: 'Exposing tools for this stream' });

      // Fast-path streaming: if the message is simple and does not require tools,
      // avoid using the streaming API which can emit many small chunks and
      // cause UI flicker. Instead, call the non-streaming chat and send one
      // single response chunk.
      const simpleStream = this.isSimpleMessage(message);
      if (!exposeToolsStream && simpleStream) {
        try {
          onChunk({ type: 'thinking', thinking: true });
          const resp = await ollamaService.chat(message, sessionId, [], context, { saveHistory: false });
          const out = this.truncateMessage(resp && resp.message ? String(resp.message) : '', 1000);
          onChunk({ type: 'content', content: out });
          onChunk({ type: 'thinking', thinking: false });
          onChunk({ type: 'complete', toolCallsExecuted: 0 });
          return;
        } catch (e) {
          console.warn('Fast-path stream fallback failed:', e && e.message);
          // fall through to normal streaming behavior
        }
      }

      // Start streaming
      const stream = ollamaService.chatStream(
        message,
        sessionId,
        exposeToolsStream ? toolDefinitions : [],
        context
      );

      let toolCalls = [];
      
      // Helper: detect if a content chunk is actually serialized tool-call JSON
      const isLikelyToolCallString = (txt) => {
        if (!txt || typeof txt !== 'string') return false;
        const s = txt.trim();
        if (!(s.startsWith('{') || s.startsWith('['))) return false;
        try {
          const parsed = JSON.parse(s);
          // parsed could be an array of tool-call objects or an object with "type": "function"
          if (Array.isArray(parsed)) {
            return parsed.length > 0 && (parsed[0].type === 'function' || parsed[0].function || parsed[0].name);
          }
          if (parsed && (parsed.type === 'function' || parsed.function || parsed.name)) return true;
        } catch (e) {
          return false;
        }
        return false;
      };
      // Reduce UI flicker by coalescing content chunks and sending one "thinking" indicator.
      let thinkingSent = false;
      let toolInvokingSent = false;
      let contentBuffer = '';
      let flushTimer = null;
      const FLUSH_DELAY = 150; // ms

      const flushContent = () => {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        if (contentBuffer && contentBuffer.length > 0) {
          onChunk({ type: 'content', content: contentBuffer });
          contentBuffer = '';
        }
      };

      // Send a single thinking indicator at stream start
      if (!thinkingSent) {
        onChunk({ type: 'thinking', thinking: true });
        thinkingSent = true;
      }

      for await (const chunk of stream) {
        if (chunk.type === 'content') {
          // Avoid forwarding raw serialized tool-call JSON which some models emit
          if (isLikelyToolCallString(chunk.content)) {
            if (!toolInvokingSent) {
              onChunk({ type: 'info', info: 'Invoking tools...' });
              toolInvokingSent = true;
            }
            continue;
          }

          // Buffer small content fragments and flush in batches to avoid UI flicker
          contentBuffer += chunk.content;
          if (flushTimer) clearTimeout(flushTimer);
          flushTimer = setTimeout(flushContent, FLUSH_DELAY);

        } else if (chunk.type === 'done') {
          toolCalls = chunk.toolCalls || [];
        } else if (chunk.type === 'error') {
          // ensure thinking indicator is cleared on error
          if (thinkingSent) onChunk({ type: 'thinking', thinking: false });
          onChunk({ type: 'error', error: chunk.error });
          return;
        }
      }

      // flush any remaining buffered content after the stream ends
      flushContent();

      // Handle tool calls if any
      while (toolCalls.length > 0 && iteration < this.maxToolIterations) {
        iteration++;
        onChunk({ type: 'tool_execution', count: toolCalls.length });

        // Execute tools
        const toolPromises = toolCalls.map(async (toolCall) => {
          const result = await executeTool(
            toolCall.function.name,
            toolCall.function.arguments
          );
          return { name: toolCall.function.name, result };
        });

        const toolResults = await Promise.all(toolPromises);
        allToolResults.push(...toolResults);

        // Continue with tool results
        const continueResponse = await ollamaService.continueWithToolResults(
          sessionId,
          toolResults,
          toolDefinitions
        );

        // Format tool results server-side if possible so streaming clients get
        // a nicely laid out message (avoids compact single-line responses).
        const formatted = this.formatToolResults(allToolResults, continueResponse.message);
        const outMsg = formatted || continueResponse.message;
        // Avoid sending raw serialized tool-call JSON — append to buffer/flush instead
        if (isLikelyToolCallString(outMsg)) {
          if (!toolInvokingSent) {
            onChunk({ type: 'info', info: 'Tool invocation completed. Preparing results...' });
            toolInvokingSent = true;
          }
        } else {
          // Buffer formatted content and flush shortly to avoid flicker
          contentBuffer += outMsg;
          if (flushTimer) clearTimeout(flushTimer);
          flushTimer = setTimeout(() => {
            if (contentBuffer) {
              onChunk({ type: 'content', content: contentBuffer });
              contentBuffer = '';
            }
            if (thinkingSent) onChunk({ type: 'thinking', thinking: false });
          }, FLUSH_DELAY);
        }
        toolCalls = continueResponse.toolCalls || [];
      }

      // Ensure any buffered content is flushed and the thinking indicator cleared
      flushContent();
      if (thinkingSent) onChunk({ type: 'thinking', thinking: false });
      onChunk({ type: 'complete', toolCallsExecuted: allToolResults.length });
    } catch (error) {
      console.error('Error in streaming:', error);
      onChunk({ 
        type: 'error', 
        error: "I encountered an error. Please try again." 
      });
    }
  }

  /**
   * Get conversation history for a session
   */
  getHistory(sessionId) {
    return ollamaService.getHistory(sessionId);
  }

  /**
   * Clear conversation history for a session
   */
  clearHistory(sessionId) {
    ollamaService.clearHistory(sessionId);
  }

  /**
   * Generate a session ID for a user
   */
  generateSessionId(userId) {
    return `session_${userId}_${Date.now()}`;
  }
}

// Singleton instance
const aiRouter = new AIRouter();

module.exports = aiRouter;
