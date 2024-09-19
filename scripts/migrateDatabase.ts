import Database from "better-sqlite3";
import path from "path";

const migrateDatabase = () => {
  const dbPath = path.join(__dirname, "..", "db", "data.db");
  const db = new Database(dbPath);

  try {
    db.transaction(() => {
      // Step 1: Create a new table with the updated schema (temporary name)
      db.prepare(
        `
          CREATE TABLE IF NOT EXISTS movements_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            main_target TEXT NOT NULL,
            name TEXT NOT NULL,
            variation TEXT,
            demo_url TEXT NOT NULL
          )
        `
      ).run();
      console.log("New table 'movements_new' created successfully.");

      // Step 2: Copy data from the old table to the new table (handling NULL values)
      db.prepare(
        `
          INSERT INTO movements_new (id, main_target, name, variation, demo_url)
          SELECT 
            id, 
            COALESCE(main_target, 'Unknown Target'), 
            COALESCE(name, 'Untitled'), 
            variation, 
            COALESCE(demo_url, 'Unknown') 
          FROM movements
        `
      ).run();
      console.log("Data copied successfully to 'movements_new'.");

      // Step 3: Drop the old table
      db.prepare(`DROP TABLE movements`).run();
      console.log("Old 'movements' table dropped.");

      // Step 4: Rename the new table to the original name
      db.prepare(`ALTER TABLE movements_new RENAME TO movements`).run();
      console.log("Table renamed from 'movements_new' to 'movements'.");
    })(); // Transaction end

    console.log("Database migration completed successfully.");
  } catch (error) {
    console.error("Error during database migration:", error);
  } finally {
    db.close();
    console.log("Database connection closed.");
  }
};

migrateDatabase();
