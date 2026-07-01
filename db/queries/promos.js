import { pool } from "../index.js";

// Money off a given subtotal, capped so an order can never go negative.
export function computeDiscount(promo, subtotal) {
  if (!promo) return 0;

  const raw =
    promo.discount_type === "percent"
      ? (subtotal * Number(promo.discount_value)) / 100
      : Number(promo.discount_value);

  return Math.round(Math.min(raw, subtotal) * 100) / 100;
}

export async function getVendorPromos(vendorId) {
  const result = await pool.query(
    `SELECT id, code, discount_type, discount_value, min_order, active, expires_at, created_at
     FROM promo_codes
     WHERE vendor_id = $1
     ORDER BY created_at DESC`,
    [vendorId]
  );

  return result.rows;
}

export async function createPromo(vendorId, { code, discountType, discountValue, minOrder, expiresAt }) {
  const result = await pool.query(
    `INSERT INTO promo_codes (vendor_id, code, discount_type, discount_value, min_order, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [vendorId, code, discountType, discountValue, minOrder || 0, expiresAt || null]
  );

  return result.rows[0];
}

export async function togglePromo(id, vendorId) {
  await pool.query(
    "UPDATE promo_codes SET active = NOT active WHERE id = $1 AND vendor_id = $2",
    [id, vendorId]
  );
}

export async function deletePromo(id, vendorId) {
  await pool.query(
    "DELETE FROM promo_codes WHERE id = $1 AND vendor_id = $2",
    [id, vendorId]
  );
}

// Validate a code against a vendor + subtotal. Returns { promo, discount } when
// it applies, otherwise { error } with a customer-facing reason.
export async function validatePromo(vendorId, code, subtotal) {
  const cleaned = (code || "").trim().toUpperCase();
  if (!cleaned) return { error: "Enter a promo code." };

  const result = await pool.query(
    "SELECT * FROM promo_codes WHERE vendor_id = $1 AND code = $2",
    [vendorId, cleaned]
  );
  const promo = result.rows[0];

  if (!promo || !promo.active) return { error: "That code isn't valid." };
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return { error: "That code has expired." };
  }
  if (subtotal < Number(promo.min_order)) {
    return { error: `Spend at least KSh ${Number(promo.min_order)} to use this code.` };
  }

  return { promo, discount: computeDiscount(promo, subtotal), code: cleaned };
}
