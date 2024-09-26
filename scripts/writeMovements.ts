import Database from "better-sqlite3";
import fs from "fs/promises";
import path from "path";

const dbPath = path.join(__dirname, "..", "db", "data.db");

const db = new Database(dbPath);

// Define the type of an existing record (for enrichment fields)
interface EnrichedRecord {
  primary_targets: string;
  secondary_targets: string;
  equipment_needed: string;
  fatigue_rating: string;
  complexity: string;
}

// Step 1: Create or update the table schema with the new fields
const createTable = () => {
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT DEFAULT 'unknown' NOT NULL,
      target_group TEXT DEFAULT 'unknown' NOT NULL,
      variation TEXT,
      demo_url TEXT DEFAULT 'unknown' NOT NULL,
      primary_targets TEXT DEFAULT '[]' NOT NULL,
      secondary_targets TEXT DEFAULT '[]' NOT NULL,
      equipment_needed TEXT DEFAULT 'unknown' NOT NULL,
      fatigue_rating INTEGER DEFAULT 0 NOT NULL,
      complexity INTEGER DEFAULT 0 NOT NULL
    )
  `
  ).run();
};

// Step 2: Insert or update a movement in the database, preserving enriched fields
const insertMovement = (movement: any): boolean => {
  try {
    // Check the database to see if there is an existing row with the same movement name
    // If so, extract the enriched data for preservation
    const existingRecord = db
      .prepare(
        `SELECT primary_targets, secondary_targets, equipment_needed, fatigue_rating, complexity 
       FROM movements WHERE name = ?`
      )
      .get(movement.name) as EnrichedRecord | undefined;

    // This SQL query is prepared to insert a new record or replace an existing one in the movements table.
    // It ensures that if a record with the same name already exists, it will be replaced with the new values, but it will keep the enriched fields if they are present.
    const insertOrUpdate = db.prepare(`
      INSERT OR REPLACE INTO movements (
        name, target_group, variation, demo_url, 
        primary_targets, secondary_targets, equipment_needed, fatigue_rating, complexity
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertOrUpdate.run(
      movement.name,
      movement.targetGroup,
      movement.variation,
      movement.demo,
      existingRecord ? existingRecord.primary_targets : "[]", // Preserve enriched fields if they exist
      existingRecord ? existingRecord.secondary_targets : "[]",
      existingRecord ? existingRecord.equipment_needed : "unknown",
      existingRecord ? existingRecord.fatigue_rating : 0, // Default to 0 for unknown
      existingRecord ? existingRecord.complexity : 0 // Default to 0 for unknown
    );

    return true;
  } catch (error) {
    console.error(`Error inserting or updating ${movement.name}:`, error);
    return false;
  }
};

// Step 3: Write all data to the database
const writeAllData = async () => {
  const failedInserts: any[] = [];
  try {
    const filePath = path.join(__dirname, "..", "data", "movements.json");
    const data = await fs.readFile(filePath, "utf8");
    const movements = JSON.parse(data);
    console.log(`Read ${movements.length} movements from file`);

    createTable();

    for (const movement of movements) {
      const isInserted = insertMovement(movement);
      if (!isInserted) {
        failedInserts.push(movement);
      }
    }

    console.log("All movements have been processed.");
    return failedInserts;
  } catch (error) {
    console.error("Error reading or writing movements file:", error);
    throw error;
  }
};

// Log any movements that failed to be inserted
const logFailedMovements = async (failedMovements: any) => {
  if (failedMovements.length > 0) {
    const logFilePath = path.join(
      __dirname,
      "..",
      "logs",
      "failed_movements.json"
    );
    try {
      await fs.writeFile(
        logFilePath,
        JSON.stringify(failedMovements, null, 2),
        "utf8"
      );
      console.log(
        `Logged ${failedMovements.length} failed movements to ${logFilePath}`
      );
    } catch (error) {
      console.error("Error logging failed movements:", error);
    }
  }
};

// Execute the write process
writeAllData()
  .then((failedInserts) => {
    return logFailedMovements(failedInserts);
  })
  .catch((err) => {
    console.error("Error during data processing or logging:", err);
  })
  .finally(() => {
    db.close();
    console.log("Database connection closed.");
  });
