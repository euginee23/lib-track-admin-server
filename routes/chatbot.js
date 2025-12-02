const express = require('express');
const router = express.Router();
const ruleBasedChatbot = require('../services/ruleBasedChatbot');

/**
 * Chatbot API Routes
 * Rule-based chatbot functionality with pattern matching and database lookups
 */

// Session storage (in-memory for now)
const sessions = new Map();

// Generate session ID
function generateSessionId(userId = 'anonymous') {
  return `session_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * POST /api/chatbot/chat
 * Send a message to the chatbot and get a response
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, sessionId, userId, userName, userRole } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Generate or use provided session ID
    const currentSessionId = sessionId || generateSessionId(userId || 'anonymous');

    // Build context
    const context = {
      userId: userId || null,
      userName: userName || 'User',
      userRole: userRole || 'student'
    };

    // Process message with rule-based chatbot
    const response = await ruleBasedChatbot.processMessage(message, context);

    // Store in session history
    if (!sessions.has(currentSessionId)) {
      sessions.set(currentSessionId, []);
    }
    const history = sessions.get(currentSessionId);
    history.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });
    history.push({
      role: 'assistant',
      content: response.message,
      timestamp: new Date(),
      intent: response.intent,
      toolUsed: response.toolUsed
    });

    res.json({
      success: true,
      sessionId: currentSessionId,
      message: response.message,
      intent: response.intent,
      toolUsed: response.toolUsed
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

/**
 * POST /api/chatbot/chat/stream
 * Send a message and receive streaming response (SSE)
 * For rule-based chatbot, we send the complete response immediately
 */
router.post('/chat/stream', async (req, res) => {
  try {
    const { message, sessionId, userId, userName, userRole } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const currentSessionId = sessionId || generateSessionId(userId || 'anonymous');

    const context = {
      userId: userId || null,
      userName: userName || 'User',
      userRole: userRole || 'student'
    };

    // Send session ID first
    res.write(`data: ${JSON.stringify({ type: 'session', sessionId: currentSessionId })}\n\n`);

    // Process message with rule-based chatbot
    const response = await ruleBasedChatbot.processMessage(message, context);

    // Store in session history
    if (!sessions.has(currentSessionId)) {
      sessions.set(currentSessionId, []);
    }
    const history = sessions.get(currentSessionId);
    history.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });
    history.push({
      role: 'assistant',
      content: response.message,
      timestamp: new Date(),
      intent: response.intent,
      toolUsed: response.toolUsed
    });

    // Send the complete response as a single content chunk
    res.write(`data: ${JSON.stringify({ type: 'content', content: response.message })}\n\n`);
    
    // Send done signal
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Error in /chat/stream endpoint:', error);
    res.write(`data: ${JSON.stringify({ 
      type: 'error', 
      error: 'Stream failed' 
    })}\n\n`);
    res.end();
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

    const history = sessions.get(sessionId) || [];

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

    sessions.delete(sessionId);

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
    res.json({
      success: true,
      status: 'online',
      service: 'Rule-Based Chatbot',
      type: 'pattern-matching',
      features: [
        'Book search',
        'Research paper search',
        'Library hours',
        'FAQs',
        'Borrowing/Return info',
        'Recommendations'
      ]
    });
  } catch (error) {
    console.error('Error checking status:', error);
    res.status(500).json({
      success: false,
      status: 'error',
      error: 'Failed to check chatbot status'
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
    const sessionId = generateSessionId(userId || 'anonymous');

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
