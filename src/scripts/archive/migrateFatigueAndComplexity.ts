import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(__dirname, "..", "db", "data.db");
const db = new Database(dbPath);

const migrateFatigueComplexityAndMetadata = () => {
  try {
    // Start the transaction to ensure atomic operations
    db.transaction(() => {
      // Step 1: Add a new INTEGER column for fatigue_rating
      db.prepare(
        `ALTER TABLE movements ADD COLUMN fatigue_rating_new INTEGER DEFAULT 0`
      ).run();

      // Step 2: Convert existing string fatigue_rating to integer
      db.prepare(
        `UPDATE movements SET fatigue_rating_new = CAST(fatigue_rating AS INTEGER)`
      ).run();

      // Step 3: Drop the old fatigue_rating column
      db.prepare(`ALTER TABLE movements DROP COLUMN fatigue_rating`).run();

      // Step 4: Rename the new fatigue_rating column to the original name
      db.prepare(
        `ALTER TABLE movements RENAME COLUMN fatigue_rating_new TO fatigue_rating`
      ).run();

      // Step 5: Add a new INTEGER column for complexity, defaulting to 0 (representing "unknown")
      db.prepare(
        `ALTER TABLE movements ADD COLUMN complexity_new INTEGER DEFAULT 0`
      ).run();

      // Step 6: Set complexity_new to 0 (representing "unknown")
      db.prepare(`UPDATE movements SET complexity_new = 0`).run();

      // Step 7: Drop the old complexity column
      db.prepare(`ALTER TABLE movements DROP COLUMN complexity`).run();

      // Step 8: Rename the new complexity column to the original name
      db.prepare(
        `ALTER TABLE movements RENAME COLUMN complexity_new TO complexity`
      ).run();

      console.log(
        "Fatigue rating and complexity fields migrated successfully."
      );

      // Step 9: Create a new metadata table to store the scale context
      db.prepare(
        `
        CREATE TABLE IF NOT EXISTS metadata (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT NOT NULL,        
          field_name TEXT NOT NULL,
          min_value INTEGER,               
          max_value INTEGER,               
          description TEXT NOT NULL
        )
      `
      ).run();

      console.log("Metadata table created successfully.");

      // Step 10: Insert metadata for fatigue_rating and complexity fields
      db.prepare(
        `
        INSERT INTO metadata (table_name, field_name, min_value, max_value, description)
        VALUES 
          ('movements', 'fatigue_rating', 0, 4, 'Represents the fatigue level from 0 (unknown) to 4 (severe)'),
          ('movements', 'complexity', 0, 4, 'Represents the complexity level from 0 (unknown) to 4 (advanced)');
      `
      ).run();

      console.log(
        "Metadata for fatigue_rating and complexity added successfully."
      );
    })(); // End of transaction
  } catch (error) {
    console.error("Error during migration:", error);
  } finally {
    db.close();
    console.log("Database connection closed.");
  }
};

// Run the migration
migrateFatigueComplexityAndMetadata();
