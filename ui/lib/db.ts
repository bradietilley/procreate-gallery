import { DatabaseSync } from "node:sqlite";
import { PROCREATE_DATABASE_PATH } from "./config";

console.log(`[DB] Connecting to ${PROCREATE_DATABASE_PATH}`);
const db = new DatabaseSync(PROCREATE_DATABASE_PATH);

// Helper functions to match the previous API
export const dbRun = (sql: string, params?: any[]) => {
  const stmt = db.prepare(sql);
  return stmt.run(...(params || []));
};

export const dbGet = <T>(sql: string, params?: any[]): T => {
  const stmt = db.prepare(sql);
  return stmt.get(...(params || [])) as T;
};

export const dbAll = <T>(sql: string, params?: any[]): T[] => {
  const stmt = db.prepare(sql);
  return stmt.all(...(params || [])) as T[];
};

export default db;
