const express = require('express');
const router = express.Router();
const aiRouter = require('../services/aiRouter');
const ollamaService = require('../services/ollamaService');
const { executeTool } = require('../services/chatbotTools');
const axios = require('axios');

/**
 * Chatbot API Routes
 * Endpoints for AI-powered chatbot functionality using Ollama
 */

/**
 * POST /api/chatbot/chat
 * Send a message to the chatbot and get a response
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, sessionId, userId, userName, userRole } = req.body;

    // CORS headers for browser clients
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Generate or use provided session ID
    const currentSessionId = sessionId || aiRouter.generateSessionId(userId || 'anonymous');

    // Build context
    const context = {
      userId: userId || null,
      userName: userName || 'User',
      userRole: userRole || 'student'
    };
    // If Ollama is not available, provide a lightweight fallback
    if (!ollamaService.available) {
      const text = (message || '').toLowerCase();
      // Quick hard-coded help for common queries
      if (text.includes('hour') || text.includes('open') || text.includes('close') || text.includes('time')) {
        return res.json({
          success: true,
          sessionId: currentSessionId,
          message: "Our library hours are: Monday - Friday: 8:00 AM - 6:00 PM; Saturday: 9:00 AM - 4:00 PM; Sunday: Closed. During exam periods, hours may be extended.",
          toolCallsExecuted: 0,
          iterations: 0
        });
      }

      // If user likely asks for rules/policies, try DB fallback
      if (text.includes('rule') || text.includes('policy') || text.includes('penalty')) {
        try {
          const rules = await executeTool('get_library_rules', {});
          if (rules && rules.success && rules.rules && rules.rules.length > 0) {
            const summary = rules.rules.slice(0, 5).map(r => `- ${r.rule_title}: ${r.rule_description}`).join('\n');
            return res.json({ success: true, sessionId: currentSessionId, message: `Library rules (top results):\n${summary}` });
          }
        } catch (err) {
          // fall through to default offline message
        }
      }

      // Default fallback: return top FAQs from DB
      try {
        const faqs = await executeTool('get_faqs', { category: 'all' });
        if (faqs && faqs.success) {
          const top = faqs.faqs.slice(0, 5).map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');
          return res.json({ success: true, sessionId: currentSessionId, message: `I'm currently offline (AI unavailable). Here are some helpful FAQs:\n\n${top}` });
        }
      } catch (err) {
        // final fallback
      }

      return res.status(503).json({ success: false, error: 'AI service unavailable. Please try again later.' });
    }

    // Process message with AI router
    const response = await aiRouter.processMessage(
      message,
      currentSessionId,
      context
    );

    res.json({
      ...response,
      sessionId: currentSessionId
    });
  } catch (error) {
    console.error('Error in /chat endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process chat message',
      message: "I apologize, but I'm having trouble processing your request right now. Please try again."
    });
  }
});

// OPTIONS handlers for CORS preflight
router.options('/chat', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.sendStatus(204);
});

router.options('/chat/stream', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.sendStatus(204);
});

/**
 * POST /api/chatbot/chat/stream
 * Send a message and receive streaming response (SSE)
 */
router.post('/chat/stream', async (req, res) => {
  try {
    const { message, sessionId, userId, userName, userRole } = req.body;

    // CORS headers for browser clients
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Set up SSE and disable upstream buffering (useful behind nginx / proxies)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    // Ensure proxies and compression do not change the stream encoding
    res.setHeader('Content-Encoding', 'identity');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Ask proxies (nginx, etc.) not to buffer responses
    res.setHeader('X-Accel-Buffering', 'no');
    // Immediately flush headers so client sees the SSE stream start promptly
    if (res.flushHeaders) {
      try { res.flushHeaders(); } catch (e) { /* ignore */ }
    }

    const currentSessionId = sessionId || aiRouter.generateSessionId(userId || 'anonymous');

    const context = {
      userId: userId || null,
      userName: userName || 'User',
      userRole: userRole || 'student'
    };

    // Track client disconnects to avoid writing to closed sockets
    let clientClosed = false;
    req.on('close', () => {
      clientClosed = true;
      try { res.end(); } catch (e) {}
    });

    // Send session ID first
    const safeWrite = (obj) => {
      if (clientClosed) return false;
      try {
        res.write(`data: ${JSON.stringify(obj)}\n\n`);
        return true;
      } catch (e) {
        console.error('SSE write failed (client may have disconnected):', e && e.message);
        return false;
      }
    };

    safeWrite({ type: 'session', sessionId: currentSessionId });

    // If Ollama not available, send a single fallback chunk and close
    if (!ollamaService.available) {
      const offlineMsg = { type: 'content', content: "AI service is currently unavailable. Please try again later. Meanwhile, you can view FAQs in the app settings." };
      safeWrite(offlineMsg);
      safeWrite('[DONE]');
      return res.end();
    }

    // Keep-alive ping to keep proxies/clients from timing out the SSE connection
    const keepAliveMs = 15000;
    const keepAlive = setInterval(() => {
      if (clientClosed) return clearInterval(keepAlive);
      try {
        // SSE comment line (a single colon) is a lightweight ping
        res.write(':\n\n');
      } catch (e) {
        console.error('SSE keep-alive write failed:', e && e.message);
      }
    }, keepAliveMs);

    // Stream response
    try {
      await aiRouter.processMessageStream(
        message,
        currentSessionId,
        context,
        (chunk) => {
          if (clientClosed) return; // stop writing if client disconnected
          safeWrite(chunk);
        }
      );
      if (!clientClosed) safeWrite('[DONE]');
    } finally {
      clearInterval(keepAlive);
      try { if (!clientClosed) res.end(); } catch (e) { /* ignore */ }
    }
  } catch (error) {
    console.error('Error in /chat/stream endpoint:', error);
    try { res.write(`data: ${JSON.stringify({ type: 'error', error: 'Stream failed' })}\n\n`); } catch (e) {}
    try { res.end(); } catch (e) {}
  }
});

/**
 * GET /api/chatbot/history/:sessionId
 * Get conversation history for a session
 */
router.get('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    const history = aiRouter.getHistory(sessionId);

    res.json({
      success: true,
      sessionId,
      messageCount: history.length,
      messages: history
    });
  } catch (error) {
    console.error('Error getting history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve conversation history'
    });
  }
});

/**
 * DELETE /api/chatbot/history/:sessionId
 * Clear conversation history for a session
 */
router.delete('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    aiRouter.clearHistory(sessionId);

    res.json({
      success: true,
      message: 'Conversation history cleared',
      sessionId
    });
  } catch (error) {
    console.error('Error clearing history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear conversation history'
    });
  }
});

/**
 * GET /api/chatbot/status
 * Check chatbot service status
 */
router.get('/status', async (req, res) => {
  try {
    if (!ollamaService.available) {
      return res.status(200).json({ success: false, status: 'offline', service: 'Ollama', message: 'Ollama is not reachable. Ensure `ollama serve` is running on the host configured in OLLAMA_HOST.' });
    }

    const models = await ollamaService.listModels();
    
    res.json({
      success: true,
      status: 'online',
      service: 'Ollama',
      availableModels: models.map(m => m.name),
      currentModel: ollamaService.defaultModel
    });
  } catch (error) {
    console.error('Error checking status:', error);
    res.status(503).json({
      success: false,
      status: 'offline',
      error: 'Chatbot service is unavailable. Please ensure Ollama is running.'
    });
  }
});

/**
 * POST /api/chatbot/generate-session
 * Generate a new session ID for a user
 */
router.post('/generate-session', (req, res) => {
  try {
    const { userId } = req.body;
    const sessionId = aiRouter.generateSessionId(userId || 'anonymous');

    res.json({
      success: true,
      sessionId
    });
  } catch (error) {
    console.error('Error generating session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate session ID'
    });
  }
});

module.exports = router;

/**
 * Proxy endpoint to forward requests to an internal HTTP-only chatbot service.
 * This is useful when the frontend is served over HTTPS and cannot call HTTP
 * endpoints directly (mixed-content blocked by browsers). Configure the
 * internal target with the env var `CHATBOT_INTERNAL_URL` (default: http://127.0.0.1:3002).
 */
const INTERNAL_CHATBOT = process.env.CHATBOT_INTERNAL_URL || 'http://127.0.0.1:3002';

// Add a catch-all proxy route mounted under /api/chatbot/proxy/*
router.all('/proxy/*', async (req, res) => {
  try {
    const forwardPath = req.path.replace(/^\/proxy/, '') || '/';
    const targetUrl = INTERNAL_CHATBOT.replace(/\/$/, '') + forwardPath;

    // Diagnostic log to help debug proxying on the server
    try {
      console.info(`Chatbot proxy -> ${req.method} ${req.originalUrl} -> ${targetUrl}`);
    } catch (e) {}

    // Build headers to forward (omit host to allow axios to set correct host)
    const forwardHeaders = { ...req.headers };
    delete forwardHeaders.host;

    // Use stream response for streaming endpoints
    const axiosConfig = {
      method: req.method,
      url: targetUrl,
      headers: forwardHeaders,
      responseType: 'stream',
      validateStatus: () => true
    };

    // For non-GET/HEAD methods, forward body
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      axiosConfig.data = req.body;
    }

    const upstream = await axios(axiosConfig);

    try {
      console.info(`Chatbot proxy upstream responded: ${upstream.status} ${upstream.statusText || ''} for ${targetUrl}`);
    } catch (e) {}

    // Forward status and headers
    res.status(upstream.status);
    Object.entries(upstream.headers || {}).forEach(([k, v]) => {
      // Don't override transfer-encoding, content-encoding, content-length or connection on the response
      const key = (k || '').toLowerCase();
      if (key === 'transfer-encoding' || key === 'content-encoding' || key === 'content-length' || key === 'connection') return;
      res.setHeader(k, v);
    });

    // Pipe the upstream response stream to client
    upstream.data.on('error', (err) => {
      console.error('Error piping upstream stream:', err);
      try { res.end(); } catch (e) {}
    });
    upstream.data.pipe(res);
  } catch (err) {
    console.error('Proxy to internal chatbot failed:', err.message || err);
    res.status(502).json({ success: false, error: 'Proxy failed', details: err.message || String(err) });
  }
});
