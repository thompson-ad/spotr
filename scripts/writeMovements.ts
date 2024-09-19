import Database from "better-sqlite3";
import fs from "fs/promises";
import path from "path";

const dbPath = path.join(__dirname, "..", "db", "data.db");

const db = new Database(dbPath);

const createTable = () => {
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      main_target TEXT NOT NULL,
      name TEXT NOT NULL,
      variation TEXT,
      demo_url TEXT NOT NULL
    )
  `
  ).run();
};

const insertMovement = (movement: any): boolean => {
  try {
    const insert = db.prepare(`
      INSERT OR REPLACE INTO movements (main_target, name, variation, demo_url)
      VALUES (?, ?, ?, ?)
    `);

    insert.run(
      movement.mainTarget,
      movement.name,
      movement.variation,
      movement.demo
    );
    return true;
  } catch (error) {
    console.error(`Error inserting ${movement.name}`, error);
    return false;
  }
};

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
