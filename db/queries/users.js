import { pool } from "../index.js";

export async function getUserByEmail(email) {
  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );
  return result.rows[0];
}

export async function createUser(email, hashedPassword) {
  await pool.query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2)",
    [email, hashedPassword]
  );
}
