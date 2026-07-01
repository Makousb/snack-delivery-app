import {
  getUserAddresses,
  addAddress,
  deleteAddress,
  setDefaultAddress
} from "../db/queries/addresses.js";

function parseCoord(value, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= max ? parsed : null;
}

export async function renderAddresses(req, res, next) {
  const userId = req.session.user?.id;
  if (!userId) {
    req.flash("error", "Log in to manage your addresses.");
    return res.redirect("/auth/login");
  }

  try {
    const addresses = await getUserAddresses(userId);
    res.render("addresses", { title: "Your Addresses", addresses });
  } catch (error) {
    next(error);
  }
}

export async function createAddress(req, res, next) {
  const userId = req.session.user?.id;
  if (!userId) {
    req.flash("error", "Log in to save an address.");
    return res.redirect("/auth/login");
  }

  const address = (req.body.address || "").trim();
  const label = (req.body.label || "").trim().slice(0, 60) || null;

  if (!address) {
    req.flash("error", "Enter an address to save.");
    return res.redirect("/addresses");
  }

  try {
    await addAddress(userId, {
      label,
      address: address.slice(0, 500),
      latitude: parseCoord(req.body.deliveryLat, 90),
      longitude: parseCoord(req.body.deliveryLng, 180)
    });
    req.flash("success", "Address saved.");
    res.redirect("/addresses");
  } catch (error) {
    next(error);
  }
}

export async function removeAddress(req, res, next) {
  const userId = req.session.user?.id;
  if (!userId) return res.redirect("/auth/login");

  try {
    await deleteAddress(Number.parseInt(req.params.id, 10), userId);
    req.flash("success", "Address removed.");
    res.redirect("/addresses");
  } catch (error) {
    next(error);
  }
}

export async function makeDefaultAddress(req, res, next) {
  const userId = req.session.user?.id;
  if (!userId) return res.redirect("/auth/login");

  try {
    await setDefaultAddress(Number.parseInt(req.params.id, 10), userId);
    res.redirect("/addresses");
  } catch (error) {
    next(error);
  }
}
