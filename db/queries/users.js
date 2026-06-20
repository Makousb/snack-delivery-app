import { pool } from "../index.js";

export async function getUserByEmail(email) {
  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );
  return result.rows[0];
}

export async function createUser({ email, passwordHash, role = "customer", vendorId = null, fullName = null }) {
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, role, vendor_id, full_name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, role, vendor_id, full_name`,
    [email, passwordHash, role, vendorId, fullName]
  );

  return result.rows[0];
}
