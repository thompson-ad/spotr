import fs from "fs";
import path from "path";
import OpenAI from "openai";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const dbPath = path.join(__dirname, "..", "db", "data.db");
let db: Database.Database | null = null;

const openDatabase = () => {
  if (!db) {
    db = new Database(dbPath);
  }
  return db;
};

const closeDatabase = () => {
  if (db) {
    db.close();
    db = null;
  }
};

const programmeTemplates = ["full body", "Push, Pull, Legs", "Bro"];

const complexityLevelMap = {
  1: "beginner",
  2: "intermediate",
  3: "advanced",
};

const assumptions = {
  level: complexityLevelMap[1], // beginner
  daysAvailable: 3, // Number of days per week client can be in the gym
  workoutDuration: 90, // Time in gym per day in minutes
  injuries: "none",
  healthConsiderations: "none",
  mobilityConsiderations: "none",
  goals: ["muscle growth", "gain strength"],
  preferences: "none",
  otherActivities: "none",
  availableEquipment: "all",
};

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

const SectionMovementSchema = z.object({
  name: z.string(),
  sets: z.number(),
  reps: z.number(),
  repsInReserve: z.number(),
  orderOf: z.number(),
});

type SectionMovement = z.infer<typeof SectionMovementSchema>;

type ProcessedSectionMovement = SectionMovement & {
  id: number;
  demoUrl: string;
};

const SectionSchema = z.object({
  name: z.string(),
  orderOf: z.number(),
  type: z.string(),
  movements: z.array(SectionMovementSchema),
});

type Section = z.infer<typeof SectionSchema>;

const WorkoutSchema = z.object({
  name: z.string(),
  day: z.number(),
  type: z.string(),
  sections: z.array(SectionSchema),
});

type Workout = z.infer<typeof WorkoutSchema>;

const ProgrammeSchema = z.object({
  name: z.string(),
  description: z.string(),
  workouts: z.array(WorkoutSchema),
});

type Programme = z.infer<typeof ProgrammeSchema>;

const ProgrammeResponseSchema = z.object({
  programme: ProgrammeSchema,
});

type ProgrammeResponse = z.infer<typeof ProgrammeResponseSchema>;

type ProcessedSection = Omit<Section, "movements"> & {
  movements: ProcessedSectionMovement[];
};
type ProcessedWorkout = Omit<Workout, "sections"> & {
  sections: ProcessedSection[];
};
type ProcessedProgramme = Omit<Programme, "workouts"> & {
  workouts: ProcessedWorkout[];
};

const retrieveMovements = (): Movement[] => {
  const db = openDatabase();
  const query = `
    SELECT id, name, demo_url, target_group, primary_targets, secondary_targets, fatigue_rating
    FROM movements
    WHERE complexity < ?;
    `;
  const movements = db.prepare(query).all(3) as Movement[]; // TODO: make dynamic
  console.log(`retrieved ${movements.length} movements for embedding`);
  return movements;
};

/**
 * Summarizes movements, grouping them by their target group for better readability.
 * This refactoring helps the AI process the movements more effectively.
 */
const summariseMovements = (movements: Movement[]) => {
  const groupedMovements = movements.reduce(
    (acc: { [key: string]: Movement[] }, movement) => {
      const group = movement.target_group;
      if (!acc[group]) {
        acc[group] = [];
      }
      acc[group].push(movement);
      return acc;
    },
    {}
  );

  let summary = "";
  for (const [group, moves] of Object.entries(groupedMovements)) {
    summary += `\n#### **${group} Movements:**\n`;
    moves.forEach((m) => {
      summary += `
- **${m.name}**
  - Primary Targets: ${m.primary_targets}
  - Secondary Targets: ${m.secondary_targets}
  - Fatigue Rating: ${m.fatigue_rating}\n`;
    });
  }
  return summary;
};

/**
 * Generates the prompt for the AI, including restructured movement list and reinforced constraints.
 * This refactoring aims to improve programme quality and ensure the AI uses only allowed movements.
 */
const generatePrompt = (movements: Movement[]) => {
  const summarisedMovements = summariseMovements(movements);

  const intro = `
Your primary role is an experienced and knowledgeable personal trainer with expertise in strength and conditioning, exercise science, and biomechanics. Your specialty is in crafting **${programmeTemplates[0]} split programmes**.

---

### **Important Instructions:**

- You must **ONLY** use the movements provided in the list below to create the workout programme.
- **Do not** include any movements or exercises that are not on the list.
- Pay careful attention to the movement names to ensure accuracy.
- **Exclude warm-up and cool-down sections**. Focus on the main workout content.

---

`;

  const allowedMovementsSection = `
### **Allowed Movements:**
${summarisedMovements}
`;

  const clientConstraints = `
---

### **Client Goals and Constraints:**

- **Goals:** ${assumptions.goals.join(", ")}
- **Level:** ${assumptions.level}
- **Available Workout Days:** ${assumptions.daysAvailable} per week
- **Workout Duration:** Up to ${assumptions.workoutDuration} minutes per session

---
`;

  const programmeGuidelines = `
### **Programme Guidelines:**

- **Volume:**
  - Each major muscle group should receive **10-12 sets per week**.

- **Frequency:**
  - Train major muscle groups at least **twice per week**.

- **Exercise Order:**
  - Start workouts with exercises that have a **higher fatigue rating**.

- **Progressive Overload:**
  - Ensure regular increases in weight or reps.

- **Fatigue Management:**
  - Distribute high-fatigue exercises evenly across workouts.

- **Movement Selection:**
  - Include movements that target muscles in a stretched position.

- **Focus on Main Exercises:**
  - **Do not include warm-up or cool-down sections**. Focus only on the main workout movements.

---
`;

  const footnotes = `
### **Verification:**

- Before finalizing the programme, verify that **all movements used are from the allowed list**.
- Confirm that the volume per muscle group is within the optimal range.

---

### **Additional Notes:**

- Ensure the programme follows a classic **${programmeTemplates[0]} split design**.
- Balance the workload across workouts.
`;

  return `${intro}${allowedMovementsSection}${clientConstraints}${programmeGuidelines}${footnotes}`;
};

/**
 * Processes the AI-generated response to ensure all movements are from the allowed list.
 * Movements not on the list are flagged, and optionally, you can implement fuzzy matching.
 */
const processResponse = (
  aiGeneratedProgramme: ProgrammeResponse,
  dbMovements: Movement[]
): ProcessedProgramme => {
  const { programme } = aiGeneratedProgramme;

  // Create a list of allowed movement names in lowercase for case-insensitive comparison
  const allowedMovementNames = dbMovements.map((m) => m.name.toLowerCase());

  const processMovement = (
    movement: SectionMovement,
    dbMovements: Movement[]
  ): ProcessedSectionMovement | undefined => {
    const movementName = movement.name.toLowerCase();
    if (!allowedMovementNames.includes(movementName)) {
      console.log(`Movement "${movement.name}" is not in the allowed list.`);
      // Mark the movement as invalid
      (movement as any).invalid = true;
      return undefined;
    } else {
      const dbMovement = dbMovements.find(
        (dbm) => dbm.name.toLowerCase() === movementName
      );
      if (!dbMovement) {
        console.log(`Movement "${movement.name}" not found in database.`);
        return undefined;
      }
      return {
        ...movement,
        demoUrl: dbMovement.demo_url,
        id: dbMovement.id,
      };
    }
  };

  const processSection = (section: Section): ProcessedSection => ({
    ...section,
    movements: section.movements
      .map((movement) => processMovement(movement, dbMovements))
      .filter(
        (movement): movement is ProcessedSectionMovement =>
          movement !== undefined
      ),
  });

  const processWorkout = (workout: Workout): ProcessedWorkout => ({
    ...workout,
    sections: workout.sections.map(processSection),
  });

  return {
    ...programme,
    workouts: programme.workouts.map(processWorkout),
  };
};

const writeProgrammeToDatabase = (programme: ProcessedProgramme) => {
  const db = openDatabase();

  const writeProgramme = db.prepare(`
    INSERT INTO default_programmes (name, description)
    VALUES (?, ?)
  `);

  const writeWorkout = db.prepare(`
    INSERT INTO default_workouts (programme_id, name, day, type)
    VALUES (?, ?, ?, ?)
  `);

  const writeSection = db.prepare(`
    INSERT INTO default_sections (workout_id, name, order_of, type)
    VALUES (?, ?, ?, ?)
  `);

  const writeSectionMovement = db.prepare(`
    INSERT INTO default_section_movements (section_id, movement_id, sets, reps, order_of, reps_in_reserve)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const { name, description, workouts } = programme;

  try {
    db.transaction(() => {
      const programmeResult = writeProgramme.run(name, description);
      const programmeId = programmeResult.lastInsertRowid as number;

      workouts.forEach((w) => {
        const workoutResult = writeWorkout.run(
          programmeId,
          w.name,
          w.day,
          w.type
        );
        const workoutId = workoutResult.lastInsertRowid as number;

        w.sections.forEach((section) => {
          const sectionResult = writeSection.run(
            workoutId,
            section.name,
            section.orderOf,
            section.type
          );
          const sectionId = sectionResult.lastInsertRowid as number;

          section.movements.forEach((sectionMovement) => {
            writeSectionMovement.run(
              sectionId,
              sectionMovement.id,
              sectionMovement.sets,
              sectionMovement.reps,
              sectionMovement.orderOf,
              sectionMovement.repsInReserve
            );
          });
        });
      });
    })();

    console.log(`Programme "${name}" successfully written to database.`);
  } catch (error: any) {
    console.error("Error during database transaction:", error.message);
    throw error;
  }
};

const printToDebugPrompt = (prompt: string) => {
  const promptsDir = path.join(__dirname, "prompts");
  if (!fs.existsSync(promptsDir)) {
    fs.mkdirSync(promptsDir);
  }
  const promptFilePath = path.join(promptsDir, `prompt_programme.md`);
  fs.writeFileSync(promptFilePath, prompt, "utf-8");

  console.log(`Prompt for Programme written to ${promptFilePath}`);
};

const main = async () => {
  try {
    openDatabase(); // Open the database connection at the start
    const movements = retrieveMovements();
    const prompt = generatePrompt(movements);
    printToDebugPrompt(prompt);

    const completion = await openai.beta.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [{ role: "user", content: prompt }],
      response_format: zodResponseFormat(ProgrammeResponseSchema, "programme"),
    });

    const programme = completion.choices[0].message;
    if (programme.parsed) {
      console.log(`Programme created successfully.`);
      const postProcessedProgramme = processResponse(
        programme.parsed,
        movements
      );
      writeProgrammeToDatabase(postProcessedProgramme);
    } else if (programme.refusal) {
      console.log(programme.refusal);
    }
  } catch (error: any) {
    if (error.constructor.name == "LengthFinishReasonError") {
      console.log("Too many tokens: ", error.message);
    } else {
      console.log("An error occurred: ", error.message);
    }
  } finally {
    closeDatabase(); // Ensure the database is closed at the end
  }
};

main();
