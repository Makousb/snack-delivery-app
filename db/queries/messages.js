import { pool } from "../index.js";

export async function createMessage({ name, email, message }) {
  const result = await pool.query(
    `INSERT INTO messages (name, email, message)
     VALUES ($1, $2, $3)
     RETURNING id, name, email, message, is_read, created_at`,
    [name, email, message]
  );

  return result.rows[0];
}

export async function getAllMessages() {
  const result = await pool.query(
    `SELECT id, name, email, message, is_read, created_at
     FROM messages
     ORDER BY created_at DESC`
  );

  return result.rows;
}

export async function markMessageRead(id) {
  await pool.query(
    "UPDATE messages SET is_read = TRUE WHERE id = $1",
    [id]
  );
}
