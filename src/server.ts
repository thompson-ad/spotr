import express, { Request, Response } from "express";
import sqlite3 from "sqlite3";
import path from "path";

const app = express();

const port = 3000;
const dbPath = path.join(__dirname, "db", "exercise_data.db");

const database = new sqlite3.Database(dbPath, (error) => {
  if (error) {
    console.error("Problem setting up database", error);
  } else {
    console.log("Connected to the SQLite database");
  }
});

app.get("/", (req: Request, res: Response) => {
  res.send("Hello, Spotr!");
});

app.listen(port, () => {
  console.log(`server is running at http://localhost:${port}`);
});
