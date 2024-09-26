import Database from "better-sqlite3";
import path from "path";

const migrateSchemaUpdate = () => {
  const dbPath = path.join(__dirname, "..", "db", "data.db");
  const db = new Database(dbPath);

  try {
    db.transaction(() => {
      // Step 1: Create a new table with the updated schema (temporary name)
      db.prepare(
        `
          CREATE TABLE IF NOT EXISTS movements_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL DEFAULT 'unknown',
            target_group TEXT NOT NULL DEFAULT 'unknown',
            variation TEXT,
            demo_url TEXT DEFAULT 'unknown' NOT NULL,
            primary_targets TEXT DEFAULT '[]' NOT NULL,
            secondary_targets TEXT DEFAULT '[]' NOT NULL,
            equipment_needed TEXT DEFAULT 'unknown' NOT NULL,
            fatigue_rating TEXT DEFAULT 'unknown' NOT NULL,
            complexity TEXT DEFAULT 'unknown' NOT NULL
          )
        `
      ).run();

      console.log("New table 'movements_new' created successfully.");

      // Step 2: Copy data from the old table to the new table (handling NULL values)
      db.prepare(
        `
          INSERT INTO movements_new (
            id, name, target_group, variation, demo_url,
            primary_targets, secondary_targets, equipment_needed, fatigue_rating, complexity
          )
          SELECT 
            id, 
            COALESCE(name, 'unknown'), 
            COALESCE(main_target, 'unknown'), 
            COALESCE(variation, 'unknown'),
            COALESCE(demo_url, 'unknown'), 
            '[]',           
            '[]',           
            'unknown',      
            'unknown',      
            'unknown'       
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

migrateSchemaUpdate();
