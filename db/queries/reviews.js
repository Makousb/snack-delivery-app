import { pool } from "../index.js";

// Insert a review for an order. The caller is responsible for confirming the
// order belongs to the user and is eligible (delivered/completed); the UNIQUE
// constraint on order_id is the final guard against a duplicate review.
export async function createReview({ vendorId, userId, orderId, rating, comment }) {
  const result = await pool.query(
    `INSERT INTO reviews (vendor_id, user_id, order_id, rating, comment)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, vendor_id, user_id, order_id, rating, comment, created_at`,
    [vendorId, userId, orderId, rating, comment]
  );

  return result.rows[0];
}

export async function getReviewByOrderId(orderId) {
  const result = await pool.query(
    "SELECT id, rating, comment, created_at FROM reviews WHERE order_id = $1",
    [orderId]
  );

  return result.rows[0];
}

// Average rating + review count for a set of vendors, keyed by vendor id.
// Vendors with no reviews simply don't appear in the map; callers fall back to
// a "New" treatment for those.
export async function getVendorRatingsMap(vendorIds = []) {
  if (!vendorIds.length) return {};

  const result = await pool.query(
    `SELECT vendor_id,
            ROUND(AVG(rating)::numeric, 1) AS average,
            COUNT(*)::int AS count
     FROM reviews
     WHERE vendor_id = ANY($1)
     GROUP BY vendor_id`,
    [vendorIds]
  );

  return result.rows.reduce((map, row) => {
    map[row.vendor_id] = { average: Number(row.average), count: row.count };
    return map;
  }, {});
}

export async function getVendorRating(vendorId) {
  const map = await getVendorRatingsMap([vendorId]);
  return map[vendorId] || { average: null, count: 0 };
}

// Most recent reviews for a vendor, with the reviewer's display name.
export async function getVendorReviews(vendorId, limit = 10) {
  const result = await pool.query(
    `SELECT r.rating, r.comment, r.owner_reply, r.owner_reply_at, r.created_at, u.full_name
     FROM reviews r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.vendor_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2`,
    [vendorId, limit]
  );

  return result.rows;
}

// Every review for a vendor (owner-facing, no limit).
export async function getReviewsForVendor(vendorId) {
  const result = await pool.query(
    `SELECT r.id, r.rating, r.comment, r.owner_reply, r.owner_reply_at, r.created_at, u.full_name
     FROM reviews r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.vendor_id = $1
     ORDER BY r.created_at DESC`,
    [vendorId]
  );

  return result.rows;
}

// Save an owner's reply, scoped to their own vendor. Returns true if a matching
// review was updated.
export async function addOwnerReply(reviewId, vendorId, reply) {
  const result = await pool.query(
    `UPDATE reviews
     SET owner_reply = $1, owner_reply_at = NOW()
     WHERE id = $2 AND vendor_id = $3
     RETURNING id`,
    [reply, reviewId, vendorId]
  );

  return result.rows.length > 0;
}

// Attach `rating_average` / `rating_count` to each vendor object so views can
// render ratings without extra plumbing. Returns new objects (does not mutate).
export async function withVendorRatings(vendors = []) {
  const ratingsMap = await getVendorRatingsMap(vendors.map((vendor) => vendor.id));

  return vendors.map((vendor) => {
    const rating = ratingsMap[vendor.id] || { average: null, count: 0 };

    return {
      ...vendor,
      rating_average: rating.average,
      rating_count: rating.count
    };
  });
}
