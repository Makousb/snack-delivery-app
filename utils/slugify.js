export function slugify(value, fallback = "store") {
  const slug = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return slug || fallback;
}

export async function buildUniqueVendorSlug(db, name, ignoredVendorId = null) {
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const values = [slug];
    let query = "SELECT 1 FROM vendors WHERE slug = $1";

    if (ignoredVendorId) {
      values.push(ignoredVendorId);
      query += " AND id <> $2";
    }

    query += " LIMIT 1";

    const result = await db.query(query, values);

    if (!result.rows.length) {
      return slug;
    }

    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}
