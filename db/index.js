import pkg from "pg";
import { config } from "../config/env.js";

const { Pool } = pkg;

// Hosted platforms (Render, Heroku, Railway) hand out a single connection
// string; local development uses the discrete DB_* variables.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false
    })
  : new Pool({
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
