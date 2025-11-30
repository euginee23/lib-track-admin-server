const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
require('dotenv').config();

// WebSocket instance (will be set from server.js)
let wsServer = null;

// Function to set WebSocket server instance
router.setWebSocketServer = (ws) => {
  wsServer = ws;
};

// Get configuration from environment
const UPLOAD_DOMAIN = (process.env.UPLOAD_DOMAIN || 'https://uploads.codehub.site').replace(/\/+$/, '');
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || 'http://localhost:4000';

// Helper for null SQL params
function safe(val) {
  return val === undefined ? null : val;
}

// Helper function to download receipt image from URL
async function downloadReceiptImage(receiptUrl) {
  try {
    const response = await axios.get(receiptUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error('Error downloading receipt image:', error);
    throw new Error('Failed to download receipt image');
  }
}

// Helper function to upload receipt image to file system
async function uploadReceiptImage(fileBuffer, filename, mimeType) {
  try {
    const formData = new FormData();
    formData.append('file', fileBuffer, { filename, contentType: mimeType });
    
    const response = await axios.post(`${SERVER_BASE_URL}/api/uploads/receipt`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 30000,
    });
    
    return response.data;
  } catch (error) {
    console.error('Error uploading receipt image:', error);
    throw new Error('Failed to upload receipt image to file system');
  }
}

// Helper function to delete receipt image from file system
async function deleteReceiptImage(filename) {
  try {
    await axios.delete(`${SERVER_BASE_URL}/api/uploads/receipt/${filename}`, {
      timeout: 10000
    });
    return true;
  } catch (error) {
    console.error('Error deleting receipt image:', error);
    // Don't throw error, just log it - we can continue even if delete fails
    return false;
  }
}

router.post("/return", (req, res) => {
  const upload = req.upload.single("receipt_image");
  upload(req, res, async (err) => {
    if (err) {
      console.error("File upload error:", err);
      let errorMessage = "File upload error";
      if (err.code === "LIMIT_FILE_SIZE") {
        errorMessage = "File size too large. Maximum file size is 30MB.";
      } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
        errorMessage = "Unexpected file field. Please upload only the receipt image.";
      } else if (err.code === "LIMIT_FIELD_COUNT") {
        errorMessage = "Too many fields in the request.";
      } else {
        errorMessage = err.message;
      }
      return res.status(400).json({
        success: false,
        message: errorMessage,
        error: err.code || err.message,
      });
    }

    try {
      const {
        transaction_id,
        reference_number,
        return_date,
        user_id,
        book_ids,
        research_paper_ids,
      } = req.body;

      if (!transaction_id && !reference_number) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
          error: "Either transaction_id or reference_number is required",
        });
      }

      if (reference_number && !user_id) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
          error: "user_id is required when returning by reference_number",
        });
      }

      // Parse IDs safely (can be string, array, JSON)
      const normalizeToIntArray = (val) => {
        if (!val && val !== 0) return [];
        if (Array.isArray(val)) return val.map((i) => parseInt(i));
        if (typeof val === "string") {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) return parsed.map((i) => parseInt(i));
          } catch (_) {}
          if (val.includes(",")) return val.split(",").map((s) => parseInt(s.trim()));
          return [parseInt(val)];
        }
        return [parseInt(val)];
      };

      const bookIdsToReturn = normalizeToIntArray(book_ids).filter(Boolean);
      const researchIdsToReturn = normalizeToIntArray(research_paper_ids).filter(Boolean);

      // Determine query
      let whereClause, whereValue;
      if (transaction_id) {
        whereClause = "transaction_id = ?";
        whereValue = transaction_id;
      } else {
        whereClause = "reference_number = ?";
        whereValue = reference_number;
      }

      // Include receipt_image from DB so we can detect existing receipts
      const [allTransactions] = await pool.execute(
        `SELECT transaction_id, reference_number, user_id, book_id, research_paper_id, status, receipt_image
         FROM transactions 
         WHERE ${whereClause}`,
        [whereValue]
      );

      if (allTransactions.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No transactions found with the provided identifier",
        });
      }

      // Verify single user
      const transactionUserId = allTransactions[0].user_id;
      const hasMultipleUsers = allTransactions.some(
        (t) => t.user_id !== transactionUserId
      );
      if (hasMultipleUsers) {
        return res.status(400).json({
          success: false,
          message: "Transactions belong to multiple users",
        });
      }

      if (user_id && transactionUserId !== parseInt(user_id)) {
        return res.status(403).json({
          success: false,
          message: "User ID does not match transaction owner",
        });
      }

      // Filter only active (not Returned) - case-insensitive, trimmed
      const activeTransactions = allTransactions.filter(
        (t) => (typeof t.status === 'string' ? t.status.trim().toLowerCase() : '') !== "returned"
      );

      if (activeTransactions.length === 0) {
        // Show actual statuses for debugging, filtered by reference_number
        const relevantStatuses = allTransactions
          .filter(t => t.reference_number === whereValue)
          .map(t => ({ transaction_id: t.transaction_id, status: t.status }));
        const statusList = relevantStatuses.map(t => t.status).join(', ');
        console.warn(`No active transactions found for reference_number ${whereValue}. Statuses: ${statusList}`);
        return res.status(400).json({
          success: false,
          message: `All transactions under reference ${whereValue} are already returned.`,
          statuses: relevantStatuses,
        });
      }

      // Collect active item IDs
      const activeBookIds = activeTransactions
        .filter((t) => t.book_id)
        .map((t) => parseInt(t.book_id));
      const activeResearchIds = activeTransactions
        .filter((t) => t.research_paper_id)
        .map((t) => parseInt(t.research_paper_id));

      // --- STRICT COMPLETE CHECK ---
      const callerProvidedAny =
        bookIdsToReturn.length > 0 || researchIdsToReturn.length > 0;

      if (callerProvidedAny) {
        const missingBooks = activeBookIds.filter(
          (id) => !bookIdsToReturn.includes(id)
        );
        const missingResearch = activeResearchIds.filter(
          (id) => !researchIdsToReturn.includes(id)
        );

        const extraBooks = bookIdsToReturn.filter(
          (id) => !activeBookIds.includes(id)
        );
        const extraResearch = researchIdsToReturn.filter(
          (id) => !activeResearchIds.includes(id)
        );

        if (
          missingBooks.length > 0 ||
          missingResearch.length > 0 ||
          extraBooks.length > 0 ||
          extraResearch.length > 0
        ) {
          // Build readable combined expected + provided output
          const expectedItems = [
            ...activeBookIds.map((id) => ({ type: "book", id })),
            ...activeResearchIds.map((id) => ({ type: "research_paper", id })),
          ];
          const providedItems = [
            ...bookIdsToReturn.map((id) => ({ type: "book", id })),
            ...researchIdsToReturn.map((id) => ({ type: "research_paper", id })),
          ];

          return res.status(400).json({
            success: false,
            message:
              "Incomplete items for return. You must include all borrowed item IDs under this reference.",
            expected_items: expectedItems,
            provided_items: providedItems,
          });
        }
      } else {
        // Caller provided no IDs but items exist -> force them to include all
        const expectedItems = [
          ...activeBookIds.map((id) => ({ type: "book", id })),
          ...activeResearchIds.map((id) => ({ type: "research_paper", id })),
        ];
        return res.status(400).json({
          success: false,
          message:
            "You must specify all borrowed item IDs (book_id and/or research_paper_id) under this reference before returning.",
          expected_items: expectedItems,
          provided_items: [],
        });
      }

      // ✅ If we reach here, all required IDs match exactly
      const transactionsToReturn = activeTransactions;

      // Proceed with penalties, updates, etc. (same as before)
      const penaltyChecks = [];
      for (const transaction of transactionsToReturn) {
        const [penalties] = await pool.execute(
          `SELECT penalty_id, fine, status 
           FROM penalties 
           WHERE transaction_id = ? AND user_id = ?
           ORDER BY updated_at DESC LIMIT 1`,
          [transaction.transaction_id, transactionUserId]
        );

        if (penalties.length > 0) {
          const penalty = penalties[0];
          const isPaid = penalty.status === "Paid";
          const hasFine = Number(penalty.fine) > 0;
          penaltyChecks.push({
            transaction_id: transaction.transaction_id,
            penalty_id: penalty.penalty_id,
            fine: penalty.fine,
            status: penalty.status,
            has_unpaid_fine: hasFine && !isPaid,
          });
        }
      }

      const unpaid = penaltyChecks.filter((p) => p.has_unpaid_fine);
      if (unpaid.length > 0) {
        return res.status(402).json({
          success: false,
          message: "Cannot return items with unpaid penalties",
          unpaid_penalties: unpaid,
        });
      }

      const [userCheck] = await pool.execute(
        "SELECT user_id, restriction, first_name, last_name FROM users WHERE user_id = ?",
        [transactionUserId]
      );
      if (userCheck.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      if (userCheck[0].restriction === 1) {
        return res.status(403).json({
          success: false,
          message: "User is restricted and cannot return items",
        });
      }

      // Get existing receipt path from DB
      let receiptImagePath = null;
      let receiptStamped = false;
      let stampMethod = "none";
      
      const existingReceipt = allTransactions.find(t => t.receipt_image);
      if (existingReceipt && existingReceipt.receipt_image) {
        receiptImagePath = existingReceipt.receipt_image;
        console.log("Found existing receipt path in database:", receiptImagePath);
        
        // Extract filename from path (e.g., "/receipts/REF12345.jpg" -> "REF12345.jpg")
        const receiptFilename = path.basename(receiptImagePath);
        
        try {
          // Download the receipt image from URL
          const receiptUrl = `${UPLOAD_DOMAIN}${receiptImagePath}`;
          console.log("Downloading receipt from:", receiptUrl);
          const receiptBuffer = await downloadReceiptImage(receiptUrl);
          
          // Apply stamp using sharp
          const sharp = require("sharp");

          // Find stamp image
          const candidates = [
            path.join(process.cwd(), "ReturnedStamp.png"),
            path.join(process.cwd(), "public", "ReturnedStamp.png"),
            path.join(process.cwd(), "public", "images", "ReturnedStamp.png"),
            path.join(process.cwd(), "images", "ReturnedStamp.png"),
            path.join(__dirname, "..", "public", "ReturnedStamp.png"),
            path.join(__dirname, "..", "images", "ReturnedStamp.png"),
            path.join(__dirname, "..", "..", "lib-track-kiosk", "images", "ReturnedStamp.png"),
          ];

          let stampBuf = null;
          let stampPath = null;
          for (const p of candidates) {
            if (fs.existsSync(p)) {
              stampBuf = fs.readFileSync(p);
              stampPath = p;
              break;
            }
          }

          if (stampBuf) {
            console.log(`Using PNG stamp from: ${stampPath}`);
            
            const img = sharp(receiptBuffer);
            const meta = await img.metadata();
            const w = meta.width || 1200;
            const h = meta.height || 800;
            
            // Scale stamp to 40% of the smaller dimension for better visibility
            const targetSize = Math.floor(Math.min(w, h) * 0.4);

            // Create stamp with slight rotation and transparency
            const stamp = sharp(stampBuf)
              .rotate(-15, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
              .resize({ width: targetSize, withoutEnlargement: true })
              .png();

            const stampResized = await stamp.toBuffer();

            const stampedBuf = await img
              .composite([
                { 
                  input: stampResized, 
                  gravity: "center", 
                  blend: "over"
                },
              ])
              .jpeg({ quality: 90 })
              .toBuffer();

            console.log("Receipt stamped successfully, uploading...");
            
            // Delete the old receipt file
            console.log(`Deleting old receipt: ${receiptFilename}`);
            await deleteReceiptImage(receiptFilename);
            
            // Upload the new stamped receipt with the same filename
            console.log(`Uploading stamped receipt: ${receiptFilename}`);
            const uploadResult = await uploadReceiptImage(
              stampedBuf, 
              receiptFilename, 
              'image/jpeg'
            );
            
            console.log("Stamped receipt uploaded successfully:", uploadResult);
            receiptStamped = true;
            stampMethod = "png";
            // Keep the same path in database
          } else {
            console.log("No PNG stamp found, keeping receipt without stamp");
            stampMethod = "no_stamp";
          }
        } catch (e) {
          console.error("Receipt stamping failed:", e);
          stampMethod = "failed";
          // Keep the original receipt path even if stamping fails
        }
      }
      const returnDate = return_date ? new Date(return_date) : new Date();

      // Process return
      const returnedItems = [];
      for (const t of transactionsToReturn) {
        // Update transaction status and return_date
        // No need to update receipt_image as it's already stamped in place
        await pool.execute(
          `UPDATE transactions SET status='Returned', return_date=? WHERE transaction_id=?`,
          [returnDate, t.transaction_id]
        );

        if (t.book_id) {
          await pool.execute(
            "UPDATE books SET status='Available' WHERE book_id=?",
            [t.book_id]
          );
          const [book] = await pool.execute(
            "SELECT book_title FROM books WHERE book_id=?",
            [t.book_id]
          );
          returnedItems.push({
            transaction_id: t.transaction_id,
            item_type: "book",
            item_id: t.book_id,
            item_title: book[0]?.book_title || "Unknown Book",
          });
        }

        if (t.research_paper_id) {
          await pool.execute(
            "UPDATE research_papers SET status='Available' WHERE research_paper_id=?",
            [t.research_paper_id]
          );
          const [rp] = await pool.execute(
            "SELECT research_title FROM research_papers WHERE research_paper_id=?",
            [t.research_paper_id]
          );
          returnedItems.push({
            transaction_id: t.transaction_id,
            item_type: "research_paper",
            item_id: t.research_paper_id,
            item_title: rp[0]?.research_title || "Unknown Research Paper",
          });
        }
      }

      // Determine whether there's a receipt in the database
      const dbHasReceipt = !!receiptImagePath;

      const userName = `${userCheck[0].first_name} ${userCheck[0].last_name}`;

      // BROADCAST WEBSOCKET EVENT FOR BOOK RETURN
      if (wsServer) {
        wsServer.broadcast({
          type: 'BOOK_RETURNED',
          data: {
            user_id: transactionUserId,
            user_name: userName,
            reference_number: allTransactions[0].reference_number,
            total_returned: returnedItems.length,
            returned_items: returnedItems.map(item => ({
              type: item.type,
              id: item.id,
              title: item.item_title
            })),
            return_date: returnDate,
            has_penalties: penaltyChecks.length > 0
          },
          timestamp: new Date().toISOString()
        });

        // SAVE TO ACTIVITY LOG
        try {
          const itemDetails = returnedItems.map(item => 
            `${item.type === 'book' ? 'Book' : 'Research Paper'}: ${item.item_title}`
          ).join(', ');

          await pool.execute(
            `INSERT INTO activity_logs (user_id, action, details, status, created_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [
              transactionUserId,
              'BOOK_RETURNED',
              `Returned ${returnedItems.length} item(s) - Reference: ${allTransactions[0].reference_number} - Items: ${itemDetails}`,
              'completed'
            ]
          );
        } catch (logError) {
          console.error('Error saving activity log:', logError);
          // Don't fail the request if logging fails
        }
      }

      return res.status(200).json({
        success: true,
        message: `${returnedItems.length} item(s) returned successfully`,
        data: {
          returned_items: returnedItems,
          reference_number: allTransactions[0].reference_number,
          user_id: transactionUserId,
          user_name: userName,
          total_returned: returnedItems.length,
          total_active_before_return: activeTransactions.length,
          penalty_checks: penaltyChecks,
          has_receipt: dbHasReceipt,
          receipt_url: receiptImagePath ? `${UPLOAD_DOMAIN}${receiptImagePath}` : null,
          receipt_stamped: receiptStamped,
          stamp_method: stampMethod,
        },
      });
    } catch (error) {
      console.error("Return error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to return book/research paper",
        error: error.message,
      });
    }
  });
});

module.exports = router;
