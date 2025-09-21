const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");

// ADD NEW SHELF
router.post("/add-shelf", async (req, res) => {
  const { shelf_number, shelf_column, shelf_row } = req.body;

  if (!shelf_number || !shelf_column || !shelf_row) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: shelf_number, shelf_column, shelf_row",
    });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO book_shelf_location (shelf_number, shelf_column, shelf_row, created_at)
       VALUES (?, ?, ?, NOW())`,
      [shelf_number, shelf_column, shelf_row]
    );

    res.status(201).json({
      success: true,
      message: "Shelf added successfully",
      shelfId: result.insertId,
    });
  } catch (error) {
    console.error("Error adding shelf:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add shelf",
      error: error.message,
    });
  }
});

// FETCH ALL SHELVES
router.get("/shelves", async (req, res) => {
  try {
    const [shelves] = await pool.execute(
      `SELECT 
        book_shelf_loc_id AS shelf_id,
        shelf_number,
        shelf_column,
        shelf_row,
        created_at
      FROM book_shelf_location
      ORDER BY shelf_number ASC`
    );

    res.status(200).json({
      success: true,
      count: shelves.length,
      data: shelves,
    });
  } catch (error) {
    console.error("Error fetching shelves:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch shelves",
      error: error.message,
    });
  }
});

// DELETE SHELF
router.delete("/delete-shelf/:shelf_number", async (req, res) => {
  const { shelf_number } = req.params;

  console.log("Received request to delete shelf with number:", shelf_number);

  if (!shelf_number) {
    return res.status(400).json({
      success: false,
      message: "Missing required parameter: shelf_number",
    });
  }

  try {
    // Delete all locations for this shelf number
    const [result] = await pool.execute(
      `DELETE FROM book_shelf_location WHERE shelf_number = ?`,
      [shelf_number]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Shelf not found",
      });
    }

    console.log(`Deleted ${result.affectedRows} location(s) for shelf ${shelf_number}`);

    res.status(200).json({
      success: true,
      message: `Shelf ${shelf_number} deleted successfully`,
      deletedLocations: result.affectedRows,
    });
  } catch (error) {
    console.error("Error deleting shelf:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete shelf",
      error: error.message,
    });
  }
});

// UPDATE SHELF
router.put("/update-shelf/:shelf_id", async (req, res) => {
  const { shelf_id } = req.params;
  const { shelf_number, shelf_column, shelf_row } = req.body;

  console.log("Received request to update shelf with ID:", shelf_id);
  console.log("Request body:", req.body);

  if (!shelf_id || !shelf_number || !shelf_column || !shelf_row) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: shelf_id, shelf_number, shelf_column, shelf_row",
      received: { shelf_id, body: req.body }
    });
  }

  try {
    const [result] = await pool.execute(
      `UPDATE book_shelf_location 
       SET shelf_number = ?, shelf_column = ?, shelf_row = ? 
       WHERE book_shelf_loc_id = ?`,
      [shelf_number, shelf_column, shelf_row, shelf_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Shelf not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Shelf updated successfully",
    });
  } catch (error) {
    console.error("Error updating shelf:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update shelf",
      error: error.message,
    });
  }
});

// ADD ROW TO SHELF
router.post("/shelf/:shelf_id/add-row", async (req, res) => {
  const { shelf_id } = req.params;
  const { new_row_count } = req.body;

  if (!shelf_id || !new_row_count) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: shelf_id, new_row_count",
    });
  }

  try {
    // First, get the shelf details and current locations
    const [shelfDetails] = await pool.execute(
      `SELECT DISTINCT shelf_number, shelf_column FROM book_shelf_location 
       WHERE book_shelf_loc_id = ? OR shelf_number = (
         SELECT shelf_number FROM book_shelf_location WHERE book_shelf_loc_id = ? LIMIT 1
       )
       ORDER BY shelf_column`,
      [shelf_id, shelf_id]
    );

    if (shelfDetails.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shelf not found",
      });
    }

    const shelf_number = shelfDetails[0].shelf_number;

    // Get current rows for this shelf
    const [currentRows] = await pool.execute(
      `SELECT DISTINCT shelf_row FROM book_shelf_location 
       WHERE shelf_number = ? ORDER BY shelf_row`,
      [shelf_number]
    );

    const currentRowCount = currentRows.length > 0 ? Math.max(...currentRows.map(r => parseInt(r.shelf_row))) : 0;

    if (new_row_count <= currentRowCount) {
      return res.status(400).json({
        success: false,
        message: `New row count (${new_row_count}) must be greater than current count (${currentRowCount})`,
      });
    }

    // Get all existing columns for this shelf
    const existingColumns = [...new Set(shelfDetails.map(detail => detail.shelf_column))];

    // Generate new row numbers
    const newRowsToAdd = [];
    for (let i = currentRowCount + 1; i <= new_row_count; i++) {
      newRowsToAdd.push(i);
    }

    // Prepare batch insert for new row locations
    const values = [];
    for (const row of newRowsToAdd) {
      for (const column of existingColumns) {
        values.push([shelf_number, column, row, new Date()]);
      }
    }

    if (values.length > 0) {
      const placeholders = values.map(() => "(?, ?, ?, ?)").join(", ");
      
      const [result] = await pool.execute(
        `INSERT INTO book_shelf_location (shelf_number, shelf_column, shelf_row, created_at)
         VALUES ${placeholders}`,
        values.flat()
      );

      res.status(201).json({
        success: true,
        message: `${newRowsToAdd.length} row(s) added successfully for ${existingColumns.length} column(s)`,
        rowsAdded: newRowsToAdd,
        affectedRows: result.affectedRows,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "No new rows to add",
      });
    }
  } catch (error) {
    console.error("Error adding row:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add row",
      error: error.message,
    });
  }
});

// REMOVE ROW FROM SHELF
router.post("/shelf/:shelf_id/remove-row", async (req, res) => {
  const { shelf_id } = req.params;
  const { new_row_count } = req.body;

  if (!shelf_id || new_row_count === undefined) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: shelf_id, new_row_count",
    });
  }

  try {
    // First, get the shelf details
    const [shelfDetails] = await pool.execute(
      `SELECT shelf_number FROM book_shelf_location 
       WHERE book_shelf_loc_id = ? LIMIT 1`,
      [shelf_id]
    );

    if (shelfDetails.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shelf not found",
      });
    }

    const { shelf_number } = shelfDetails[0];

    // Get current rows for this shelf
    const [currentRows] = await pool.execute(
      `SELECT DISTINCT shelf_row FROM book_shelf_location 
       WHERE shelf_number = ? ORDER BY shelf_row`,
      [shelf_number]
    );

    const currentRowCount = currentRows.length > 0 ? Math.max(...currentRows.map(r => parseInt(r.shelf_row))) : 0;

    if (new_row_count >= currentRowCount) {
      return res.status(400).json({
        success: false,
        message: `New row count (${new_row_count}) must be less than current count (${currentRowCount})`,
      });
    }

    if (new_row_count < 1) {
      return res.status(400).json({
        success: false,
        message: "Row count must be at least 1",
      });
    }

    // Generate row numbers to remove (remove from the end)
    const rowsToRemove = [];
    for (let i = new_row_count + 1; i <= currentRowCount; i++) {
      rowsToRemove.push(i);
    }

    // Remove the specified rows
    let totalAffectedRows = 0;
    for (const row of rowsToRemove) {
      const [result] = await pool.execute(
        `DELETE FROM book_shelf_location 
         WHERE shelf_number = ? AND shelf_row = ?`,
        [shelf_number, row]
      );
      totalAffectedRows += result.affectedRows;
    }

    res.status(200).json({
      success: true,
      message: `${rowsToRemove.length} row(s) removed successfully`,
      rowsRemoved: rowsToRemove,
      affectedRows: totalAffectedRows,
    });
  } catch (error) {
    console.error("Error removing row:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove row",
      error: error.message,
    });
  }
});

// DELETE ROW FROM SHELF
router.delete("/shelf/:shelf_id/delete-row/:row_number", async (req, res) => {
  const { shelf_id, row_number } = req.params;

  if (!shelf_id || !row_number) {
    return res.status(400).json({
      success: false,
      message: "Missing required parameters: shelf_id, row_number",
    });
  }

  try {
    // First, get the shelf details
    const [shelfDetails] = await pool.execute(
      `SELECT shelf_number FROM book_shelf_location 
       WHERE book_shelf_loc_id = ? LIMIT 1`,
      [shelf_id]
    );

    if (shelfDetails.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shelf not found",
      });
    }

    const { shelf_number } = shelfDetails[0];

    // Delete the row
    const [result] = await pool.execute(
      `DELETE FROM book_shelf_location 
       WHERE shelf_number = ? AND shelf_row = ?`,
      [shelf_number, row_number]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Row not found in the shelf",
      });
    }

    res.status(200).json({
      success: true,
      message: "Row deleted successfully",
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    console.error("Error deleting row:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete row",
      error: error.message,
    });
  }
});

// ADD COLUMN TO SHELF
router.post("/shelf/:shelf_id/add-column", async (req, res) => {
  const { shelf_id } = req.params;
  const { new_column_count } = req.body;

  if (!shelf_id || !new_column_count) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: shelf_id, new_column_count",
    });
  }

  try {
    // First, get the shelf details and current locations
    const [shelfDetails] = await pool.execute(
      `SELECT DISTINCT shelf_number, shelf_row FROM book_shelf_location 
       WHERE book_shelf_loc_id = ? OR shelf_number = (
         SELECT shelf_number FROM book_shelf_location WHERE book_shelf_loc_id = ? LIMIT 1
       )
       ORDER BY shelf_row`,
      [shelf_id, shelf_id]
    );

    if (shelfDetails.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shelf not found",
      });
    }

    const shelf_number = shelfDetails[0].shelf_number;

    // Get current columns for this shelf
    const [currentColumns] = await pool.execute(
      `SELECT DISTINCT shelf_column FROM book_shelf_location 
       WHERE shelf_number = ? ORDER BY shelf_column`,
      [shelf_number]
    );

    const currentColumnCount = currentColumns.length;

    if (new_column_count <= currentColumnCount) {
      return res.status(400).json({
        success: false,
        message: `New column count (${new_column_count}) must be greater than current count (${currentColumnCount})`,
      });
    }

    // Generate new column letters
    const getColumnLabel = (index) => String.fromCharCode(65 + index);
    const newColumnsToAdd = [];
    
    for (let i = currentColumnCount; i < new_column_count; i++) {
      newColumnsToAdd.push(getColumnLabel(i));
    }

    // Get all existing rows for this shelf
    const existingRows = [...new Set(shelfDetails.map(detail => detail.shelf_row))];

    // Prepare batch insert for new column locations
    const values = [];
    for (const column of newColumnsToAdd) {
      for (const row of existingRows) {
        values.push([shelf_number, column, row, new Date()]);
      }
    }

    if (values.length > 0) {
      const placeholders = values.map(() => "(?, ?, ?, ?)").join(", ");
      
      const [result] = await pool.execute(
        `INSERT INTO book_shelf_location (shelf_number, shelf_column, shelf_row, created_at)
         VALUES ${placeholders}`,
        values.flat()
      );

      res.status(201).json({
        success: true,
        message: `${newColumnsToAdd.length} column(s) added successfully for ${existingRows.length} row(s)`,
        columnsAdded: newColumnsToAdd,
        affectedRows: result.affectedRows,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "No new columns to add",
      });
    }
  } catch (error) {
    console.error("Error adding column:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add column",
      error: error.message,
    });
  }
});

// REMOVE COLUMN FROM SHELF
router.post("/shelf/:shelf_id/remove-column", async (req, res) => {
  const { shelf_id } = req.params;
  const { new_column_count } = req.body;

  if (!shelf_id || new_column_count === undefined) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: shelf_id, new_column_count",
    });
  }

  try {
    // First, get the shelf details
    const [shelfDetails] = await pool.execute(
      `SELECT shelf_number FROM book_shelf_location 
       WHERE book_shelf_loc_id = ? LIMIT 1`,
      [shelf_id]
    );

    if (shelfDetails.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shelf not found",
      });
    }

    const { shelf_number } = shelfDetails[0];

    // Get current columns for this shelf
    const [currentColumns] = await pool.execute(
      `SELECT DISTINCT shelf_column FROM book_shelf_location 
       WHERE shelf_number = ? ORDER BY shelf_column`,
      [shelf_number]
    );

    const currentColumnCount = currentColumns.length;

    if (new_column_count >= currentColumnCount) {
      return res.status(400).json({
        success: false,
        message: `New column count (${new_column_count}) must be less than current count (${currentColumnCount})`,
      });
    }

    if (new_column_count < 1) {
      return res.status(400).json({
        success: false,
        message: "Column count must be at least 1",
      });
    }

    // Generate column letters to remove (remove from the end)
    const getColumnLabel = (index) => String.fromCharCode(65 + index);
    const columnsToRemove = [];
    
    for (let i = new_column_count; i < currentColumnCount; i++) {
      columnsToRemove.push(getColumnLabel(i));
    }

    // Remove the specified columns
    let totalAffectedRows = 0;
    for (const column of columnsToRemove) {
      const [result] = await pool.execute(
        `DELETE FROM book_shelf_location 
         WHERE shelf_number = ? AND shelf_column = ?`,
        [shelf_number, column]
      );
      totalAffectedRows += result.affectedRows;
    }

    res.status(200).json({
      success: true,
      message: `${columnsToRemove.length} column(s) removed successfully`,
      columnsRemoved: columnsToRemove,
      affectedRows: totalAffectedRows,
    });
  } catch (error) {
    console.error("Error removing column:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove column",
      error: error.message,
    });
  }
});

// DELETE COLUMN FROM SHELF
router.delete("/shelf/:shelf_id/delete-column/:column", async (req, res) => {
  const { shelf_id, column } = req.params;

  if (!shelf_id || !column) {
    return res.status(400).json({
      success: false,
      message: "Missing required parameters: shelf_id, column",
    });
  }

  try {
    // First, get the shelf details
    const [shelfDetails] = await pool.execute(
      `SELECT shelf_number FROM book_shelf_location 
       WHERE book_shelf_loc_id = ? LIMIT 1`,
      [shelf_id]
    );

    if (shelfDetails.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shelf not found",
      });
    }

    const { shelf_number } = shelfDetails[0];

    // Delete the column
    const [result] = await pool.execute(
      `DELETE FROM book_shelf_location 
       WHERE shelf_number = ? AND shelf_column = ?`,
      [shelf_number, column]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Column not found in the shelf",
      });
    }

    res.status(200).json({
      success: true,
      message: "Column deleted successfully",
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    console.error("Error deleting column:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete column",
      error: error.message,
    });
  }
});

// Add multiple rows at once to a shelf
router.post("/shelf/:shelf_id/add-rows", async (req, res) => {
  const { shelf_id } = req.params;
  const { rows, column } = req.body;

  if (!shelf_id || !rows || !rows.length || !column) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: shelf_id, rows (array), column",
    });
  }

  try {
    // First, get the shelf details
    const [shelfDetails] = await pool.execute(
      `SELECT shelf_number FROM book_shelf_location 
       WHERE book_shelf_loc_id = ? LIMIT 1`,
      [shelf_id]
    );

    if (shelfDetails.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shelf not found",
      });
    }

    const { shelf_number } = shelfDetails[0];

    // Prepare batch insert for all new rows
    const values = rows.map(row => [shelf_number, column, row, new Date()]);
    const placeholders = values.map(() => "(?, ?, ?, ?)").join(", ");
    
    const [result] = await pool.execute(
      `INSERT INTO book_shelf_location (shelf_number, shelf_column, shelf_row, created_at)
       VALUES ${placeholders}`,
      values.flat()
    );

    res.status(201).json({
      success: true,
      message: `${rows.length} rows added successfully`,
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    console.error("Error adding multiple rows:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add rows",
      error: error.message,
    });
  }
});

// Add multiple columns at once to a shelf
router.post("/shelf/:shelf_id/add-columns", async (req, res) => {
  const { shelf_id } = req.params;
  const { columns, row } = req.body;

  if (!shelf_id || !columns || !columns.length || !row) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: shelf_id, columns (array), row",
    });
  }

  try {
    // First, get the shelf details
    const [shelfDetails] = await pool.execute(
      `SELECT shelf_number FROM book_shelf_location 
       WHERE book_shelf_loc_id = ? LIMIT 1`,
      [shelf_id]
    );

    if (shelfDetails.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shelf not found",
      });
    }

    const { shelf_number } = shelfDetails[0];

    // Prepare batch insert for all new columns
    const values = columns.map(column => [shelf_number, column, row, new Date()]);
    const placeholders = values.map(() => "(?, ?, ?, ?)").join(", ");
    
    const [result] = await pool.execute(
      `INSERT INTO book_shelf_location (shelf_number, shelf_column, shelf_row, created_at)
       VALUES ${placeholders}`,
      values.flat()
    );

    res.status(201).json({
      success: true,
      message: `${columns.length} columns added successfully`,
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    console.error("Error adding multiple columns:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add columns",
      error: error.message,
    });
  }
});

module.exports = router;