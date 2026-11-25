import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCHEMA_PATH = path.join(__dirname, "schema.sql");
const DEFAULT_DB_PATH = path.resolve(process.cwd(), "data", "ticketing.sqlite");

export function openDatabase(dbPath = process.env.SQLITE_PATH || DEFAULT_DB_PATH, schemaPath = DEFAULT_SCHEMA_PATH) {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");

  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  db.exec(schemaSql);

  return db;
}