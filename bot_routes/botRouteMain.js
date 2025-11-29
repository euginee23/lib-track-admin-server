const express = require('express');
const router = express.Router();

// Load stocks-side bot sub-routes (optional)
let stocksBooksRoute = null;
let stocksResearchRoute = null;
try {
	stocksBooksRoute = require('./stocks_side/getAvailable_Books');
	stocksResearchRoute = require('./stocks_side/getAvailable_ResearchPapers');
} catch (err) {
	// If stocks side routes are missing, ignore — they may be added later
}

// Mount stocks sub-routes if present
if (stocksBooksRoute) router.use('/stocks', stocksBooksRoute);
if (stocksResearchRoute) router.use('/stocks', stocksResearchRoute);

// Allow parent to inject WebSocket server (forward to subroutes if supported)
router.setWebSocketServer = (ws) => {
	if (stocksBooksRoute && typeof stocksBooksRoute.setWebSocketServer === 'function') {
		stocksBooksRoute.setWebSocketServer(ws);
	}
	if (stocksResearchRoute && typeof stocksResearchRoute.setWebSocketServer === 'function') {
		stocksResearchRoute.setWebSocketServer(ws);
	}
};

module.exports = router;
