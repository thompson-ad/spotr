import Airtable from "airtable";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const API_TOKEN = process.env.AIRTABLE_API_KEY;

const base = new Airtable({ apiKey: API_TOKEN }).base("appTZudz8cnoXORhw");

const tables = ["Chest", "Back", "Shoulders", "Arms", "Legs", "Core"];

const fetchTableData = async (tableName: string) => {
  try {
    const tableData = await base(tableName).select().all();
    const records = tableData.map((record) => ({
      mainTarget: tableName,
      name: record.get("Name"),
      variation: record.get("Variation"),
      demo: record.get("Client Demo"),
    }));
    console.log(`Fetched ${records.length} records from ${tableName}`);
    return records;
  } catch (error) {
    console.error(`error in fetching records for ${tableName}`, error);
    throw error;
  }
};

const writeDataToFile = async (data: any) => {
  const outputPath = path.join(__dirname, "..", "data", "movements.json");
  await fs.writeFile(outputPath, JSON.stringify(data, null, 2), "utf8");
  console.log(`Data written to ${outputPath}`);
};

const fetchAllData = async () => {
  try {
    const allRecords = await Promise.all(tables.map((t) => fetchTableData(t)));
    const flattenedRecords = allRecords.flat();
    console.log(
      `Fetched ${flattenedRecords.length} records from Spotrs Exercise DB`
    );
    await writeDataToFile(flattenedRecords);
  } catch (error) {
    console.error("Error in fetching all records", error);
    throw error;
  }
};

fetchAllData().catch((error) => {
  console.error("Unhandled error in fetchAllData", error);
});
