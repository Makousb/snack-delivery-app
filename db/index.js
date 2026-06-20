import pkg from "pg";
import { config } from "../config/env.js";

const { Pool } = pkg;

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.name,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : false
});

pool.on("connect", () => {
  console.info("Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL error", err);
  process.exit(1);
});

export { pool };
