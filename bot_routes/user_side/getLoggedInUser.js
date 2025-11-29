const express = require("express");
const router = express.Router();
const { pool } = require("../../config/database");
const jwt = require("jsonwebtoken");

// Middleware to verify JWT token
// Token can be provided in one of these places (in order):
// 1. `Authorization: Bearer <token>` header
// 2. `token` field in JSON body (dev fallback)
// 3. `?token=` query param (dev fallback)
const authenticateToken = (req, res, next) => {
	const authHeader = req.headers['authorization'];
	let token = authHeader && authHeader.split(' ')[1];
	let tokenSource = authHeader ? 'header' : null;

	// Fallbacks for clients that send token differently (useful for debugging/dev)
	if (!token && req.body?.token) {
		token = req.body.token;
		tokenSource = 'body';
	}
	if (!token && req.query?.token) {
		token = req.query.token;
		tokenSource = 'query';
	}

	// Fallback: try cookies (e.g. if frontend set an auth cookie named `token`)
	if (!token && req.headers?.cookie) {
		try {
			const cookiePairs = req.headers.cookie.split(';').map(c => c.trim());
			const cookies = {};
			for (const pair of cookiePairs) {
				const idx = pair.indexOf('=');
				if (idx > -1) {
					const k = pair.slice(0, idx).trim();
					const v = decodeURIComponent(pair.slice(idx + 1).trim());
					cookies[k] = v;
				}
			}
			token = cookies.token || cookies['auth-token'] || cookies.access_token || null;
			if (token) tokenSource = 'cookie';
		} catch (e) {
			// ignore cookie parse errors
		}
	}

	if (!token) {
		return res.status(401).json({ success: false, message: "Access token required" });
	}

	// Optional debug: log which source provided the token
	console.debug('authenticateToken: token source =', tokenSource || 'unknown');

	jwt.verify(token, process.env.JWT_SECRET || "your-secret-key", (err, user) => {
		if (err) {
			return res.status(401).json({ success: false, message: "Invalid or expired token" });
		}
		req.user = user;
		next();
	});
};

// Returns the logged in user ID from JWT token
// Frontend sends: Authorization: Bearer <token>
// Server extracts user_id from token and returns it
router.get("/get-logged-in-user", authenticateToken, async (req, res) => {
	try {
		const user_id = req.user.userId; // Extract from JWT token

		// Validate user exists in database
		const [rows] = await pool.execute(
			`SELECT user_id FROM users WHERE user_id = ?`,
			[user_id]
		);

		if (!rows || rows.length === 0) {
			return res.status(404).json({ success: false, message: "User not found" });
		}

		// Return only the user_id
		return res.status(200).json({ success: true, user_id: rows[0].user_id });
	} catch (error) {
		console.error("Error validating logged in user:", error);
		return res.status(500).json({ success: false, message: "Internal server error" });
	}
});

module.exports = router;

