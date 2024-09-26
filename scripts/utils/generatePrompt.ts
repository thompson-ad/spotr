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

interface FieldConfig {
  key: keyof Movement;
  displayName: string;
  defaultValue: any;
  missingFieldDescription?: string;
  specialInstructions?: string;
}

const fieldConfigs: FieldConfig[] = [
  {
    key: "target_group",
    displayName: "Target Group",
    defaultValue: "unknown",
  },
  {
    key: "variation",
    displayName: "Variation",
    defaultValue: "unknown",
  },
  {
    key: "demo_url",
    displayName: "Demo URL",
    defaultValue: "unknown",
  },
  {
    key: "primary_targets",
    displayName: "Primary Targets",
    defaultValue: "[]",
    missingFieldDescription:
      "**Primary Targets**: A list of primary muscle groups targeted by the movement.",
  },
  {
    key: "secondary_targets",
    displayName: "Secondary Targets",
    defaultValue: "[]",
    missingFieldDescription:
      "**Secondary Targets**: A list of secondary muscle groups engaged.",
  },
  {
    key: "equipment_needed",
    displayName: "Equipment Needed",
    defaultValue: "unknown",
    missingFieldDescription:
      "**Equipment Needed**: Equipment required to perform the movement.",
    specialInstructions:
      "**The value must be one of the following strings: 'Plates', 'Barbell', 'Dumbbell', 'Machine', 'Cable', 'Weighted Bodyweight', 'EZ Barbell', 'Bodyweight'.** If none of these are suitable, use 'unknown'.",
  },
  {
    key: "fatigue_rating",
    displayName: "Fatigue Rating",
    defaultValue: 0,
    missingFieldDescription:
      "**Fatigue Rating**: An integer from 1 (low fatigue) to 4 (very high fatigue).",
  },
  {
    key: "complexity",
    displayName: "Complexity",
    defaultValue: 0,
    missingFieldDescription:
      "**Complexity**: An integer from 1 (simple movement) to 4 (very complex movement).",
  },
];

export function generatePrompt(
  movement: Movement,
  missingFields: (keyof Movement)[],
  referenceMovements: Movement[]
) {
  const existingFields: string[] = [];
  const missingFieldsDescriptions: string[] = [];

  fieldConfigs.forEach((fieldConfig) => {
    const value = movement[fieldConfig.key];

    const isMissing = missingFields.includes(fieldConfig.key as keyof Movement);

    if (!isMissing) {
      existingFields.push(`- ${fieldConfig.displayName}: ${value}`);
    } else if (fieldConfig.missingFieldDescription) {
      const descriptionNumber = missingFieldsDescriptions.length + 1;
      let description = `${descriptionNumber}. ${fieldConfig.missingFieldDescription}`;
      if (fieldConfig.specialInstructions) {
        description += ` ${fieldConfig.specialInstructions}`;
      }
      missingFieldsDescriptions.push(description);
    }
  });

  // Build the Reference Movements section
  let referenceSection = "";
  if (referenceMovements && referenceMovements.length > 0) {
    referenceSection += "**Reference Movements:**\n\n";
    referenceMovements.forEach((refMov, index) => {
      referenceSection += `${index + 1}. **Movement Name:** ${refMov.name}\n`;
      fieldConfigs.forEach((fieldConfig) => {
        if (fieldConfig.key !== "name" && fieldConfig.key !== "id") {
          const value = refMov[fieldConfig.key] || fieldConfig.defaultValue;
          referenceSection += `   - ${fieldConfig.displayName}: ${value}\n`;
        }
      });
      referenceSection += `\n`;
    });
    // Add note about incomplete data
    referenceSection += `**Note:** Some reference movements may have incomplete data indicated by '[]', 'unknown', or '0'. These missing values need not be considered when assigning values to the missing fields of "${movement.name}".\n`;
  }

  // Adjust instructions based on whether reference movements are available
  let referenceInstruction = "";
  if (referenceMovements && referenceMovements.length > 0) {
    referenceInstruction = `Please consider the reference movements provided when determining appropriate values for the missing fields. Ensure that the values are consistent with the references but accurately reflect the specifics of "${movement.name}".`;
  } else {
    referenceInstruction = `Please use your expertise to determine appropriate values for the missing fields, ensuring they accurately reflect the specifics of "${movement.name}".`;
  }

  return `
Your primary role is an experienced and knowledgeable personal trainer with expertise in strength and conditioning, exercise science, and biomechanics. You also have a secondary role as a database assistant. For the given exercise movement, please provide values for the missing fields only.

**Movement Name:** ${movement.name}

${
  existingFields.length
    ? "**Existing Data:**\n" + existingFields.join("\n")
    : ""
}

**Missing Data:**
${missingFieldsDescriptions.join("\n")}

${referenceSection}

${referenceInstruction}

Please ensure that all values are accurate and relevant to "${
    movement.name
  }". Do not modify any existing data.
`;
}
