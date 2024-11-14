import sqlite3, { Database } from "sqlite3";
import express, { Request, Response } from "express";

import path from "path";

const app = express();

const port = 3000;
const dbPath = path.join(__dirname, "..", "db", "data.db");
let db: Database;

const openDatabase = async (dbPath: string): Promise<Database> => {
  const db = await new Promise<Database>((resolve, reject) => {
    const database = new sqlite3.Database(dbPath, (err) => {
      if (err) reject(err);
      else resolve(database);
    });
  });

  // Enable foreign key constraints
  await runGet(db, "PRAGMA foreign_keys=ON;");

  return db;
};

const closeDatabase = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) {
          console.error("Error closing database:", err.message);
          reject(err);
        } else {
          console.log("Database connection closed.");
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
};

// Read the user-centric API chapter in the Large apps book

const runGet = <T>(db: Database, query: string, params?: any[]): Promise<T> => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) {
        reject(err);
      }
      resolve(row as T);
    });
  });
};

const runGetAll = <T>(
  db: Database,
  query: string,
  params: any[]
): Promise<T> => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      }
      resolve(rows as T);
    });
  });
};

const getProgramme = async (id: string, db: Database) => {
  const query = `SELECT id, name, description FROM default_programmes WHERE id=?`;
  const params = [id];
  try {
    const programme = await runGet<any>(db, query, params);
    return programme;
  } catch (error) {
    console.error("Error fetching programme:", error);
    throw new Error("Failed to fetch programme");
  }
};

const getProgrammeWorkouts = async (db: Database, programmeId: string) => {
  const query = `
    SELECT id, name, day, type
    FROM default_workouts
    WHERE programme_id = ?
    ORDER BY day;`;
  try {
    const workouts = await runGetAll<any[]>(db, query, [programmeId]);
    return workouts;
  } catch (error) {
    console.error("Error fetching workouts:", error);
    throw new Error("Failed to fetch workouts");
  }
};

const getWorkoutSections = async (db: Database, programmeId: string) => {
  const query = `
  SELECT ds.id, ds.workout_id, ds.name, ds.order_of, ds.type
  FROM default_sections ds
  JOIN default_workouts dw ON ds.workout_id = dw.id
  WHERE dw.programme_id = ?;`;
  try {
    const workoutSections = await runGetAll<any[]>(db, query, [programmeId]);
    return workoutSections;
  } catch (error) {
    console.error("Error fetching workoutSections:", error);
    throw new Error("Failed to fetch workoutSections");
  }
};

const getSectionMovements = async (db: Database, programmeId: string) => {
  const query = `
  SELECT m.id, m.name, dsm.section_id, dsm.sets, dsm.reps, dsm.order_of, dsm.reps_in_reserve
  FROM movements m
  JOIN default_section_movements dsm ON m.id = dsm.movement_id
  JOIN default_sections ds ON dsm.section_id = ds.id
  JOIN default_workouts dw ON ds.workout_id = dw.id
  WHERE dw.programme_id = ?;`;
  try {
    const sectionMovements = await runGetAll<any[]>(db, query, [programmeId]);
    return sectionMovements;
  } catch (error) {
    console.error("Error fetching sectionMovements:", error);
    throw new Error("Failed to fetch sectionMovements");
  }
};

app.get(
  "/default-programme/:programmeId",
  async (req: Request, res: Response) => {
    const programmeId = req.params.programmeId;

    try {
      const [programme, workouts, workoutSections, sectionMovements] =
        await Promise.all([
          getProgramme(programmeId, db),
          getProgrammeWorkouts(db, programmeId),
          getWorkoutSections(db, programmeId),
          getSectionMovements(db, programmeId),
        ]);

      res.json({
        programme,
        workouts,
        workoutSections,
        sectionMovements,
      });
    } catch (error: any) {
      console.error(error);
      if (error.message === "Programme not found") {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Database error" });
      }
    }
  }
);

app.get("/health", async (_req: Request, res: Response) => {
  try {
    // Check database connection by running a simple query
    await runGet(db, "SELECT 1");

    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: "connected",
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      database: "disconnected",
      error: "Database connection failed",
    });
  }
});

const server = app.listen(port, async () => {
  try {
    db = await openDatabase(dbPath);
    console.log(`Server is running at http://localhost:${port}`);
  } catch (error) {
    console.error("Failed to open database:", error);
    process.exit(1);
  }
});

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("Received SIGINT. Closing HTTP server and database connection.");

  server.close(async () => {
    console.log("HTTP server closed.");

    try {
      await closeDatabase();
      console.log("Database connection closed.");
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  });
});

process.on("SIGTERM", async () => {
  console.log("Received SIGTERM. Closing HTTP server and database connection.");

  server.close(async () => {
    console.log("HTTP server closed.");

    try {
      await closeDatabase();
      console.log("Database connection closed.");
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  });
});
