import { pool } from "../index.js";

// Toggle a vendor in a user's favourites. Returns true if it's now favourited,
// false if it was removed.
export async function toggleFavorite(userId, vendorId) {
  const deleted = await pool.query(
    "DELETE FROM favorites WHERE user_id = $1 AND vendor_id = $2 RETURNING id",
    [userId, vendorId]
  );

  if (deleted.rows.length) {
    return false;
  }

  await pool.query(
    `INSERT INTO favorites (user_id, vendor_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, vendor_id) DO NOTHING`,
    [userId, vendorId]
  );

  return true;
}

// Set of vendor ids (numbers) this user has favourited — for marking cards.
export async function getFavoriteVendorIdSet(userId) {
  const result = await pool.query(
    "SELECT vendor_id FROM favorites WHERE user_id = $1",
    [userId]
  );

  return new Set(result.rows.map((row) => row.vendor_id));
}

// Full vendor rows a user has favourited, most recent first.
export async function getFavoriteVendors(userId) {
  const result = await pool.query(
    `SELECT v.*, f.created_at AS favorited_at
     FROM favorites f
     JOIN vendors v ON v.id = f.vendor_id
     WHERE f.user_id = $1
     ORDER BY f.created_at DESC`,
    [userId]
  );

  return result.rows;
}
