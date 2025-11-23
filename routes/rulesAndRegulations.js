const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// GET /api/rules - Get all rules grouped by headers
router.get('/', async (req, res) => {
  try {
    const sql = `
      SELECT 
        rh.id AS header_id,
        rh.title AS header_title,
        rh.created_at AS header_created_at,
        r.id AS rule_id,
        r.title AS rule_title,
        r.description AS rule_description,
        r.sort_order,
        r.created_at AS rule_created_at
      FROM rule_headers rh
      LEFT JOIN rules r ON r.header_id = rh.id
      ORDER BY rh.id, r.sort_order, r.id
    `;
    
    const [rows] = await pool.execute(sql);
    
    // Group rules by header
    const grouped = {};
    const headers = [];
    
    rows.forEach(row => {
      if (!grouped[row.header_id]) {
        grouped[row.header_id] = {
          id: row.header_id,
          heading: row.header_title,
          created_at: row.header_created_at,
          rules: []
        };
        headers.push(grouped[row.header_id]);
      }
      
      if (row.rule_id) {
        grouped[row.header_id].rules.push({
          id: row.rule_id,
          header_id: row.header_id,
          title: row.rule_title,
          content: row.rule_description,
          sort_order: row.sort_order,
          created_at: row.rule_created_at
        });
      }
    });
    
    return res.json({ success: true, data: headers });
  } catch (error) {
    console.error('Error fetching rules:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch rules', error: error.message });
  }
});

// POST /api/rules - Add new rules under a header (creates header if needed)
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { heading, rules } = req.body;
    
    if (!heading || !heading.trim()) {
      return res.status(400).json({ success: false, message: 'Heading is required' });
    }
    
    if (!rules || !Array.isArray(rules) || rules.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one rule is required' });
    }
    
    await connection.beginTransaction();
    
    // Check if header exists, create if not
    const [existingHeaders] = await connection.execute(
      'SELECT id FROM rule_headers WHERE title = ? LIMIT 1',
      [heading.trim()]
    );
    
    let headerId;
    if (existingHeaders.length > 0) {
      headerId = existingHeaders[0].id;
    } else {
      const [headerResult] = await connection.execute(
        'INSERT INTO rule_headers (title) VALUES (?)',
        [heading.trim()]
      );
      headerId = headerResult.insertId;
    }
    
    // Get max sort_order for this header
    const [maxOrder] = await connection.execute(
      'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM rules WHERE header_id = ?',
      [headerId]
    );
    let sortOrder = maxOrder[0].max_order;
    
    // Insert rules
    const insertPromises = rules.map((rule, index) => {
      if (!rule.title || !rule.title.trim() || !rule.content || !rule.content.trim()) {
        return null;
      }
      sortOrder++;
      return connection.execute(
        'INSERT INTO rules (header_id, title, description, sort_order) VALUES (?, ?, ?, ?)',
        [headerId, rule.title.trim(), rule.content.trim(), sortOrder]
      );
    }).filter(Boolean);
    
    await Promise.all(insertPromises);
    await connection.commit();
    
    return res.json({ success: true, message: 'Rules added successfully', header_id: headerId });
  } catch (error) {
    await connection.rollback();
    console.error('Error adding rules:', error);
    return res.status(500).json({ success: false, message: 'Failed to add rules', error: error.message });
  } finally {
    connection.release();
  }
});

// PUT /api/rules/:id - Update a single rule
router.put('/:id', async (req, res) => {
  try {
    const ruleId = Number(req.params.id);
    const { title, content, heading } = req.body;
    
    if (!title || !title.trim() || !content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Title and content are required' });
    }
    
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Get current rule info
      const [currentRule] = await connection.execute(
        'SELECT header_id FROM rules WHERE id = ?',
        [ruleId]
      );
      
      if (currentRule.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Rule not found' });
      }
      
      let headerId = currentRule[0].header_id;
      
      // If heading is provided and different, handle header change
      if (heading && heading.trim()) {
        const [existingHeader] = await connection.execute(
          'SELECT id, title FROM rule_headers WHERE id = ?',
          [headerId]
        );
        
        if (existingHeader.length > 0 && existingHeader[0].title !== heading.trim()) {
          // Check if new heading exists
          const [newHeader] = await connection.execute(
            'SELECT id FROM rule_headers WHERE title = ? LIMIT 1',
            [heading.trim()]
          );
          
          if (newHeader.length > 0) {
            headerId = newHeader[0].id;
          } else {
            const [headerResult] = await connection.execute(
              'INSERT INTO rule_headers (title) VALUES (?)',
              [heading.trim()]
            );
            headerId = headerResult.insertId;
          }
          
          // Update rule with new header_id
          await connection.execute(
            'UPDATE rules SET header_id = ?, title = ?, description = ? WHERE id = ?',
            [headerId, title.trim(), content.trim(), ruleId]
          );
        } else {
          // Just update title and content
          await connection.execute(
            'UPDATE rules SET title = ?, description = ? WHERE id = ?',
            [title.trim(), content.trim(), ruleId]
          );
        }
      } else {
        // Just update title and content
        await connection.execute(
          'UPDATE rules SET title = ?, description = ? WHERE id = ?',
          [title.trim(), content.trim(), ruleId]
        );
      }
      
      await connection.commit();
      return res.json({ success: true, message: 'Rule updated successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error updating rule:', error);
    return res.status(500).json({ success: false, message: 'Failed to update rule', error: error.message });
  }
});

// DELETE /api/rules/:id - Delete a single rule
router.delete('/:id', async (req, res) => {
  try {
    const ruleId = Number(req.params.id);
    
    const [result] = await pool.execute('DELETE FROM rules WHERE id = ?', [ruleId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Rule not found' });
    }
    
    return res.json({ success: true, message: 'Rule deleted successfully' });
  } catch (error) {
    console.error('Error deleting rule:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete rule', error: error.message });
  }
});

// PUT /api/rules/:id/reorder - Update sort order for a rule
router.put('/:id/reorder', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const ruleId = Number(req.params.id);
    const { direction } = req.body; // 'up' or 'down'
    
    if (!direction || !['up', 'down'].includes(direction)) {
      return res.status(400).json({ success: false, message: 'Invalid direction. Use "up" or "down"' });
    }
    
    await connection.beginTransaction();
    
    // Get current rule
    const [currentRule] = await connection.execute(
      'SELECT id, header_id, sort_order FROM rules WHERE id = ?',
      [ruleId]
    );
    
    if (currentRule.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Rule not found' });
    }
    
    const current = currentRule[0];
    
    // Get adjacent rule
    let adjacentSql;
    if (direction === 'up') {
      adjacentSql = `
        SELECT id, sort_order FROM rules 
        WHERE header_id = ? AND sort_order < ? 
        ORDER BY sort_order DESC LIMIT 1
      `;
    } else {
      adjacentSql = `
        SELECT id, sort_order FROM rules 
        WHERE header_id = ? AND sort_order > ? 
        ORDER BY sort_order ASC LIMIT 1
      `;
    }
    
    const [adjacentRule] = await connection.execute(adjacentSql, [current.header_id, current.sort_order]);
    
    if (adjacentRule.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Cannot move in that direction' });
    }
    
    const adjacent = adjacentRule[0];
    
    // Swap sort orders
    await connection.execute('UPDATE rules SET sort_order = ? WHERE id = ?', [adjacent.sort_order, current.id]);
    await connection.execute('UPDATE rules SET sort_order = ? WHERE id = ?', [current.sort_order, adjacent.id]);
    
    await connection.commit();
    return res.json({ success: true, message: 'Rule reordered successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error reordering rule:', error);
    return res.status(500).json({ success: false, message: 'Failed to reorder rule', error: error.message });
  } finally {
    connection.release();
  }
});

// DELETE /api/rules/header/:id - Delete header and all its rules
router.delete('/header/:id', async (req, res) => {
  try {
    const headerId = Number(req.params.id);
    
    // Foreign key constraint will cascade delete rules
    const [result] = await pool.execute('DELETE FROM rule_headers WHERE id = ?', [headerId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Header not found' });
    }
    
    return res.json({ success: true, message: 'Header and all rules deleted successfully' });
  } catch (error) {
    console.error('Error deleting header:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete header', error: error.message });
  }
});

module.exports = router;
