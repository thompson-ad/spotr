import Database, { Database as DBType } from "better-sqlite3";
import path from "path";

const dbPath = path.join(__dirname, "..", "db", "data.db");

const db = new Database(dbPath);

// Type for migration functions
type MigrationFunc = (db: DBType) => void;

function createMigrationsTable(db: DBType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function hasMigrationRun(db: DBType, migrationName: string): boolean {
  const result = db
    .prepare("SELECT COUNT(*) as count FROM migrations WHERE name = ?")
    .get(migrationName) as { count: number };
  return result.count > 0;
}

function recordMigration(db: DBType, migrationName: string): void {
  db.prepare("INSERT INTO migrations (name) VALUES (?)").run(migrationName);
}

function runMigration(
  db: DBType,
  migration: MigrationFunc,
  name: string
): void {
  if (!hasMigrationRun(db, name)) {
    migration(db);
    recordMigration(db, name);
    console.log(`Executed migration: ${name}`);
  } else {
    console.log(`Skipping migration (already executed): ${name}`);
  }
}

function runMigrations(migrations: [string, MigrationFunc][]): void {
  try {
    createMigrationsTable(db);
    for (const [name, migration] of migrations) {
      runMigration(db, migration, name);
    }
  } finally {
    db.close();
  }
}

// Example migration functions
const addUniqueConstraintToMovements: MigrationFunc = (db: DBType) => {
  db.exec(`
    CREATE TABLE new_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT DEFAULT 'unknown' NOT NULL UNIQUE,
      target_group TEXT DEFAULT 'unknown' NOT NULL,
      variation TEXT,
      demo_url TEXT DEFAULT 'unknown' NOT NULL,
      primary_targets TEXT DEFAULT '[]' NOT NULL,
      secondary_targets TEXT DEFAULT '[]' NOT NULL,
      equipment_needed TEXT DEFAULT 'unknown' NOT NULL,
      fatigue_rating INTEGER DEFAULT 0,
      complexity INTEGER DEFAULT 0
    );
    INSERT INTO new_movements SELECT * FROM movements;
    DROP TABLE movements;
    ALTER TABLE new_movements RENAME TO movements;
  `);
};

const addUniqueConstraintToDefaultProgrammes: MigrationFunc = (db: DBType) => {
  db.exec(`
    CREATE TABLE new_default_programmes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO new_default_programmes SELECT * FROM default_programmes;
    DROP TABLE default_programmes;
    ALTER TABLE new_default_programmes RENAME TO default_programmes;
  `);
};

// List of migrations to run
const migrations: [string, MigrationFunc][] = [
  ["add_unique_constraint_to_movements", addUniqueConstraintToMovements],
  [
    "add_unique_constraint_to_default_programmes",
    addUniqueConstraintToDefaultProgrammes,
  ],
  // Add more migrations here as needed
];

// Main function to run migrations
function main() {
  try {
    runMigrations(migrations);
    console.log("All migrations completed successfully.");
  } catch (error) {
    console.error("Error running migrations:", error);
  }
}

// Run the main function
main();
