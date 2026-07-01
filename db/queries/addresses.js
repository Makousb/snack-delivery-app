import { pool } from "../index.js";

export async function getUserAddresses(userId) {
  const result = await pool.query(
    `SELECT id, label, address, latitude, longitude, is_default
     FROM addresses
     WHERE user_id = $1
     ORDER BY is_default DESC, created_at DESC`,
    [userId]
  );

  return result.rows;
}

export async function addAddress(userId, { label, address, latitude, longitude }) {
  // First address a user saves becomes their default.
  const existing = await pool.query(
    "SELECT 1 FROM addresses WHERE user_id = $1 LIMIT 1",
    [userId]
  );
  const isDefault = existing.rows.length === 0;

  const result = await pool.query(
    `INSERT INTO addresses (user_id, label, address, latitude, longitude, is_default)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [userId, label || null, address, latitude, longitude, isDefault]
  );

  return result.rows[0];
}

export async function deleteAddress(id, userId) {
  await pool.query(
    "DELETE FROM addresses WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
}

// Make one address the default and clear the flag on the user's others.
export async function setDefaultAddress(id, userId) {
  await pool.query(
    "UPDATE addresses SET is_default = (id = $1) WHERE user_id = $2",
    [id, userId]
  );
}
