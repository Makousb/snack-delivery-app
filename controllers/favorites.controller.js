import { toggleFavorite, getFavoriteVendors } from "../db/queries/favorites.js";
import { withVendorRatings } from "../db/queries/reviews.js";
import { VENDOR_TYPES } from "../utils/vendorTypes.js";

function vendorTypeLabel(vendorType) {
  return VENDOR_TYPES.find((type) => type.value === vendorType)?.label || vendorType;
}

export async function toggleFavoriteHandler(req, res, next) {
  const userId = req.session.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "Log in to save favourites." });
  }

  const vendorId = Number.parseInt(req.params.vendorId, 10);

  if (!Number.isInteger(vendorId)) {
    return res.status(400).json({ error: "Invalid vendor." });
  }

  try {
    const favorited = await toggleFavorite(userId, vendorId);
    return res.json({ favorited });
  } catch (error) {
    return next(error);
  }
}

export async function renderFavorites(req, res, next) {
  const userId = req.session.user?.id;

  if (!userId) {
    req.flash("error", "Log in to see your favourites.");
    return res.redirect("/auth/login");
  }

  try {
    const rows = await getFavoriteVendors(userId);
    const vendors = await withVendorRatings(
      rows.map((vendor) => ({ ...vendor, vendor_type_label: vendorTypeLabel(vendor.vendor_type) }))
    );

    res.render("favorites", { title: "Your Favourites", vendors });
  } catch (error) {
    return next(error);
  }
}
