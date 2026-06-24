import { pool } from "../index.js";

// A user's "usual order": the vendor they order from most often, plus the
// items they order most frequently from that vendor, rebuilt at current
// prices. Returns null when there's nothing reliable to suggest (no order
// history, or none of the past items are still available).
//
// "Usual" is frequency-based, not just "last order": items are ranked by how
// many of the user's orders at that vendor included them, then by total
// quantity. The suggested quantity is the typical per-order amount. When a
// user has only ordered once, this naturally collapses to that single order.
export async function getUsualOrder(userId) {
  if (!userId) return null;

  const vendorResult = await pool.query(
    `SELECT o.vendor_id
     FROM orders o
     WHERE o.user_id = $1
     GROUP BY o.vendor_id
     ORDER BY COUNT(*) DESC, MAX(o.created_at) DESC
     LIMIT 1`,
    [userId]
  );

  const usualVendorId = vendorResult.rows[0]?.vendor_id;
  if (!usualVendorId) return null;

  const vendorInfo = await pool.query(
    "SELECT id, name, vendor_type FROM vendors WHERE id = $1",
    [usualVendorId]
  );
  const vendor = vendorInfo.rows[0];
  if (!vendor) return null;

  const itemsResult = await pool.query(
    `SELECT
       mi.id,
       mi.name,
       mi.price,
       COUNT(DISTINCT o.id) AS times_ordered,
       SUM(oi.quantity) AS total_qty
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN menu_items mi ON mi.id = oi.menu_item_id
     WHERE o.user_id = $1
       AND o.vendor_id = $2
       AND mi.status = 'Available'
     GROUP BY mi.id, mi.name, mi.price
     ORDER BY times_ordered DESC, total_qty DESC, mi.name ASC
     LIMIT 8`,
    [userId, usualVendorId]
  );

  const items = itemsResult.rows.map((row) => {
    const timesOrdered = Number(row.times_ordered) || 1;
    const totalQty = Number(row.total_qty) || 0;
    const typicalQty = Math.max(1, Math.round(totalQty / timesOrdered));

    return {
      id: row.id,
      name: row.name,
      price: Number(row.price),
      qty: typicalQty
    };
  });

  if (items.length === 0) return null;

  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  return {
    vendor: { id: vendor.id, name: vendor.name, vendor_type: vendor.vendor_type },
    items,
    total
  };
}
