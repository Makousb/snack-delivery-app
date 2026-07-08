import { pool } from "../index.js";

export async function getAllMenuItems(vendorId) {
  if (!vendorId) {
    const result = await pool.query(
      `SELECT *
       FROM menu_items
       ORDER BY vendor_id ASC, display_order ASC, id ASC`
    );

    return result.rows;
  }

  const result = await pool.query(
    `SELECT *
     FROM menu_items
     WHERE vendor_id = $1
     ORDER BY display_order ASC, id ASC`,
    [vendorId]
  );

  return result.rows;
}

export async function getMenuItemById(id, vendorId) {
  const result = await pool.query(
    `SELECT *
     FROM menu_items
     WHERE id = $1 AND vendor_id = $2`,
    [id, vendorId]
  );

  return result.rows[0];
}

export async function createMenuItem(data) {
  const {
    name,
    description,
    price,
    image_url,
    category,
    status,
    vendor_id
  } = data;

  await pool.query(
    `INSERT INTO menu_items
     (name, description, price, image_url, category, status, vendor_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      name,
      description,
      price,
      image_url,
      category,
      status || "Available",
      vendor_id
    ]
  );
}

export async function updateMenuItem(id, data) {
  const {
    name,
    description,
    price,
    image_url,
    category,
    status,
    vendor_id
  } = data;

  await pool.query(
    `UPDATE menu_items
     SET name = $1,
         description = $2,
         price = $3,
         image_url = $4,
         category = $5,
         status = $6
     WHERE id = $7 AND vendor_id = $8`,
    [
      name,
      description,
      price,
      image_url,
      category,
      status,
      id,
      vendor_id
    ]
  );
}

export async function deleteMenuItem(id, vendorId) {
  await pool.query(
    `DELETE FROM menu_items
     WHERE id = $1 AND vendor_id = $2`,
    [id, vendorId]
  );
}
