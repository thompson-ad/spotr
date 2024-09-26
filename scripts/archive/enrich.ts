import Database from "better-sqlite3";
import path from "path";
import fs from "fs/promises";
import Fuse from "fuse.js";
import readline from "readline";

const dbPath = path.join(__dirname, "..", "db", "data.db");
const db = new Database(dbPath);

interface CuratedMovement {
  name: string;
  primaryTargets: string[];
  secondaryTargets: string[];
  fatigueRating: number;
}

interface Movement {
  name: string;
  targetGroup: string;
  variation: string;
  demo: string;
}

interface CuratedLookup {
  [name: string]: CuratedMovement;
}

// Readline setup for CLI input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (question: string): Promise<string> => {
  return new Promise((resolve) => rl.question(question, resolve));
};

const readCurated = async (): Promise<CuratedMovement[]> => {
  try {
    const filePath = path.join(__dirname, "..", "data", "curated.json");
    const data = await fs.readFile(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error(error);
    return [];
  }
};

const createCuratedLookup = (movements: CuratedMovement[]): CuratedLookup => {
  return movements.reduce((acc, curr) => {
    const normalizedKey = curr.name.toLowerCase();
    acc[normalizedKey] = curr;
    return acc;
  }, {} as CuratedLookup);
};

const readMovements = async (): Promise<Movement[]> => {
  try {
    const filePath = path.join(__dirname, "..", "data", "movements.json");
    const data = await fs.readFile(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error(error);
    return [];
  }
};

const fuzzyMatchMovements = (
  curated: CuratedMovement[],
  movementName: string
) => {
  const fuse = new Fuse(curated, {
    keys: ["name", "primaryTargets", "secondaryTargets"], // Match by movement name and muscle groups
    threshold: 0.4, // Allows for some flexibility in matching
    distance: 100, // Limits how far the algorithm can match characters
    ignoreLocation: true, // Ignores the position of the match within the string
    ignoreFieldNorm: true, // Treat all fields equally for matching
  });

  const result = fuse.search(movementName);
  return result.length > 0 ? result[0].item : null;
};

const updateMovementWithEnrichment = (
  movement: Movement,
  fuzzyMatch: CuratedMovement
) => {
  const update = db.prepare(`
          UPDATE movements
          SET primary_targets = ?, secondary_targets = ?, fatigue_rating = ?, complexity = ?
          WHERE LOWER(name) = LOWER(?) -- Use the original movement name for updating
        `);

  const result = update.run(
    JSON.stringify(fuzzyMatch.primaryTargets || []),
    JSON.stringify(fuzzyMatch.secondaryTargets || []),
    fuzzyMatch.fatigueRating || 0, // Ensure it's an integer; default to 0 for unknown
    0, // Complexity is currently unknown, so default to 0
    movement.name.trim().toLowerCase() // Use the original movement name for lookup
  );

  console.log(`Updated ${result.changes} row(s) for ${movement.name}`); // Log number of changes
};

const enrichDatabaseWithMatches = async (
  matches: { movement: Movement; fuzzyMatch: CuratedMovement }[]
) => {
  try {
    for (const { movement, fuzzyMatch } of matches) {
      // Update the movement using the original name in the `movements` table
      updateMovementWithEnrichment(movement, fuzzyMatch);
      console.log(`Enriched ${movement.name}`);
    }
    console.log("Database enrichment complete.");
  } catch (error) {
    console.error("Error during database enrichment:", error);
  } finally {
    db.close();
    rl.close();
  }
};

const confirmFuzzyMatches = async (
  movement: any,
  fuzzyMatch: CuratedMovement
) => {
  console.clear(); // Clear the terminal before presenting a new match
  console.log(`Potential match for: ${movement.name}`);
  console.log(`Fuzzy match: ${fuzzyMatch.name}`);

  // Default to empty arrays if undefined, then join them for display
  const primaryTargets = (fuzzyMatch.primaryTargets || []).join(", ");
  const secondaryTargets = (fuzzyMatch.secondaryTargets || []).join(", ");

  console.log(`Primary targets: ${primaryTargets}`);
  console.log(`Secondary targets: ${secondaryTargets}`);
  console.log(`Fatigue rating: ${fuzzyMatch.fatigueRating}`);

  const answer = await askQuestion("Use this match? (Y/N): ");
  return answer.trim().toLowerCase() === "y";
};

const readAll = async () => {
  return await Promise.all([readCurated(), readMovements()]);
};

const runFuzzyEnrichment = async () => {
  const [curated, movements] = await readAll();

  const lookup = createCuratedLookup(curated);
  const matches: { movement: Movement; fuzzyMatch: CuratedMovement }[] = [];
  const unmatched: Movement[] = [];
  const potentialFuzzyMatches: {
    movement: Movement;
    fuzzyMatch: CuratedMovement;
  }[] = [];

  // Exact matches
  for (const movement of movements) {
    const match = lookup[movement.name.toLowerCase()];
    if (match) {
      matches.push({ movement, fuzzyMatch: match });
    } else {
      unmatched.push(movement);
    }
  }

  // Fuzzy matches
  for (const movement of unmatched) {
    const fuzzyMatch = fuzzyMatchMovements(curated, movement.name);
    if (fuzzyMatch) {
      potentialFuzzyMatches.push({ movement, fuzzyMatch });
    }
  }

  // Show how many fuzzy matches were found
  console.log(`Found ${potentialFuzzyMatches.length} fuzzy matches.`);

  // Now prompt the user for confirmation
  for (const { movement, fuzzyMatch } of potentialFuzzyMatches) {
    const isConfirmed = await confirmFuzzyMatches(movement, fuzzyMatch);
    if (isConfirmed) {
      matches.push({ movement, fuzzyMatch });
    } else {
      console.log(`Skipped enrichment for: ${movement.name}`);
    }
  }

  return matches;
};

const gracefulExit = () => {
  console.log("\nGracefully exiting... No database changes will be made.");

  // Use a slight delay to ensure the message is printed before closing the interface
  setTimeout(() => {
    rl.close();
    process.exit(0); // Exit without error
  }, 100);
};

// Handle process interruptions (e.g., Ctrl+C)
process.on("SIGINT", gracefulExit);
process.on("SIGTERM", gracefulExit);

runFuzzyEnrichment()
  .then((confirmedMatches) => {
    console.log(`Enriching ${confirmedMatches.length} movements...`);
    return enrichDatabaseWithMatches(confirmedMatches);
  })
  .catch((error) => {
    console.error("Error during data processing:", error);
    gracefulExit();
  });
