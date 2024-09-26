import OpenAI from "openai";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import pLimit from "p-limit";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { generatePrompt } from "./utils/generatePrompt";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const dbPath = path.join(__dirname, "..", "db", "data.db");
const db = new Database(dbPath);

interface Movement {
  id: number;
  name: string;
  target_group: string;
  variation: string;
  demo_url: string;
  primary_targets: string;
  secondary_targets: string;
  equipment_needed: string;
  fatigue_rating: number;
  complexity: number;
}

const selectUnenrichedMovements = () => {
  const select = db.prepare(
    `SELECT * FROM movements 
    WHERE primary_targets = '[]' 
    OR secondary_targets = '[]' 
    OR equipment_needed = 'unknown' 
    OR fatigue_rating = 0 
    OR complexity = 0;`
  );

  return select.all() as Movement[];
};

const getReferenceMovements = (movement: Movement) => {
  const select = db.prepare(
    `SELECT * FROM movements
     WHERE id != ?
       AND target_group = ?
       AND primary_targets != '[]'
       AND fatigue_rating != 0
     LIMIT 3;`
  );
  const references = select.all(
    movement.id,
    movement.target_group
  ) as Movement[];

  return references || [];
};

const printToDebugPrompt = (prompt: string, movement: Movement) => {
  // Write the prompt to a file for debugging
  // make this optional
  const promptsDir = path.join(__dirname, "prompts");
  if (!fs.existsSync(promptsDir)) {
    fs.mkdirSync(promptsDir);
  }
  const promptFilePath = path.join(
    promptsDir,
    `prompt_movement_${movement.id}.md`
  );
  fs.writeFileSync(promptFilePath, prompt, "utf-8");

  console.log(
    `Prompt for Movement ID ${movement.id} written to ${promptFilePath}`
  );
};

const getMissingFields = (movement: Movement): (keyof Movement)[] => {
  const expectedFields: { [K in keyof Movement]?: Movement[K] } = {
    primary_targets: "[]",
    secondary_targets: "[]",
    equipment_needed: "unknown",
    fatigue_rating: 0,
    complexity: 0,
  };

  return Object.entries(expectedFields)
    .filter(
      ([field, expectedValue]) =>
        movement[field as keyof Movement] === expectedValue
    )
    .map(([field]) => field as keyof Movement);
};

function getMovementSchema(missingFields: (keyof Movement)[]) {
  const schemaShape: Record<string, z.ZodTypeAny> = {};

  const schemaDefinitions = {
    primary_targets: z.array(z.string()),
    secondary_targets: z.array(z.string()),
    equipment_needed: z.enum([
      "Plates",
      "Barbell",
      "Dumbbell",
      "Machine",
      "Cable",
      "Weighted Bodyweight",
      "EZ Barbell",
      "Bodyweight",
      "unknown",
    ]),
    fatigue_rating: z.number().int(),
    complexity: z.number().int(),
  };

  missingFields.forEach((field) => {
    if (field in schemaDefinitions) {
      schemaShape[field] =
        schemaDefinitions[field as keyof typeof schemaDefinitions];
    }
  });

  return z.object(schemaShape);
}

const enrichMovement = async (movement: Movement) => {
  const missingFields = getMissingFields(movement);
  const responseSchema = getMovementSchema(missingFields);
  const referenceMovements = getReferenceMovements(movement);
  const prompt = generatePrompt(movement, missingFields, referenceMovements);
  // printToDebugPrompt(prompt, movement);
  try {
    const completion = await openai.beta.chat.completions.parse({
      model: "gpt-4o-mini-2024-07-18",
      messages: [{ role: "user", content: prompt }],
      response_format: zodResponseFormat(responseSchema, "enrich_movement"),
    });

    const enrichmentFields = completion.choices[0].message;

    if (enrichmentFields.parsed) {
      console.log(`Movement ID ${movement.id} enriched successfully.`);
      const fieldsToUpdate = enrichmentFields.parsed;
      const fieldNames = Object.keys(fieldsToUpdate);

      if (fieldNames.length > 0) {
        try {
          // Start transaction
          db.transaction(() => {
            const setClause = fieldNames
              .map((field) => `${field} = ?`)
              .join(", ");

            // Prepare the values array
            const values = fieldNames.map((field) => {
              const value = fieldsToUpdate[field];
              // If the field is an array, store it as a JSON string
              if (Array.isArray(value)) {
                return JSON.stringify(value);
              }
              return value;
            });

            values.push(movement.id);

            const updateQuery = `UPDATE movements SET ${setClause} WHERE id = ?`;

            db.prepare(updateQuery).run(...values);
          })();
          console.log(`Movement ID ${movement.id} updated successfully.`);
        } catch (err) {
          console.error(`Error updating movement ID ${movement.id}:`, err);
        }
      }
    } else if (enrichmentFields.refusal) {
      // handle refusal
      console.log(enrichmentFields.refusal);
    }
  } catch (error: any) {
    // Handle edge cases
    if (error.constructor.name == "LengthFinishReasonError") {
      // Retry with a higher max tokens
      console.log("Too many tokens: ", error.message);
    } else {
      // Handle other exceptions
      console.log("An error occurred: ", error.message);
    }
  }
  ``;
};
const main = async () => {
  const limit = pLimit(7); // Usage limit is 500 RPM ~ 8 RPS, keep it a little below just incase
  const movements = selectUnenrichedMovements();
  const promises = movements.map((m) => limit(() => enrichMovement(m)));
  await Promise.all(promises);
};

main();
