import { pool } from "../db/index.js";
import {
  calculateCartTotal,
  ensureVendorCart,
  flattenCart,
  getPositiveQuantity
} from "../utils/cart.js";

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function getMenuItem(itemId, vendorId) {
  const result = await pool.query(
    "SELECT id, name, price FROM menu_items WHERE id = $1 AND vendor_id = $2",
    [itemId, vendorId]
  );

  return result.rows[0];
}

function upsertCartItem(items, menuItem, quantity) {
  const existingItem = items.find((item) => String(item.id) === String(menuItem.id));

  if (existingItem) {
    existingItem.qty += quantity;
    return;
  }

  items.push({
    id: menuItem.id,
    name: menuItem.name,
    price: Number(menuItem.price),
    qty: quantity
  });
}

export async function addToCart(req, res, next) {
  const { id: vendorId } = req.params;
  const { itemId, qty } = req.body;
  const quantity = getPositiveQuantity(qty);

  try {
    const menuItem = await getMenuItem(itemId, vendorId);

    if (!menuItem) {
      return res.status(404).send("Item not found");
    }

    const vendorCart = ensureVendorCart(req, vendorId);
    upsertCartItem(vendorCart, menuItem, quantity);

    await saveSession(req);
    return res.redirect(req.get("Referrer") || `/vendor/${vendorId}/menu`);
  } catch (error) {
    return next(error);
  }
}

export async function addToCartAjax(req, res, next) {
  const { id, qty, vendorId, forceSwitch } = req.body;
  const quantity = getPositiveQuantity(qty);

  if (!vendorId) {
    return res.status(400).json({ error: "Missing vendorId" });
  }

  try {
    const menuItem = await getMenuItem(id, vendorId);

    if (!menuItem) {
      return res.status(404).json({ error: "Item not found" });
    }

    if (!req.session.cart) {
      req.session.cart = {};
    }

    const existingVendorIds = Object.keys(req.session.cart).filter(
      (currentVendorId) => req.session.cart[currentVendorId]?.length
    );

    if (
      existingVendorIds.length > 0 &&
      !req.session.cart[vendorId] &&
      !forceSwitch
    ) {
      return res.json({
        switchRequired: true,
        currentVendor: existingVendorIds[0],
        newVendor: vendorId
      });
    }

    if (forceSwitch) {
      req.session.cart = {};
    }

    const vendorCart = ensureVendorCart(req, vendorId);
    upsertCartItem(vendorCart, menuItem, quantity);

    const cartCount = Object.values(req.session.cart).reduce(
      (sum, items) => sum + items.reduce((itemSum, item) => itemSum + item.qty, 0),
      0
    );

    await saveSession(req);

    return res.json({
      cartCount,
      switchRequired: false
    });
  } catch (error) {
    return next(error);
  }
}

export function viewCart(req, res) {
  const { id: vendorId } = req.params;
  const cartItems = ensureVendorCart(req, vendorId);
  const total = calculateCartTotal(cartItems);

  return res.render("cart", {
    title: "Your Cart",
    vendorId,
    cartItems,
    total
  });
}

export function viewGlobalCart(req, res) {
  const cartItems = flattenCart(req.session.cart || {});
  const total = calculateCartTotal(cartItems);

  return res.render("cart", {
    title: "Your Cart",
    cartItems,
    total,
    vendorId: cartItems[0]?.vendorId || null
  });
}

export async function removeFromCart(req, res, next) {
  const { id: vendorId } = req.params;
  const { itemId } = req.body;
  const vendorCart = ensureVendorCart(req, vendorId);

  req.session.cart[vendorId] = vendorCart.filter(
    (item) => String(item.id) !== String(itemId)
  );

  try {
    await saveSession(req);
    return res.redirect("/cart");
  } catch (error) {
    return next(error);
  }
}

export async function updateCartItem(req, res, next) {
  const { vendorId, itemId, qty } = req.body;

  if (!vendorId || !itemId) {
    return res.status(400).send("Missing cart item data");
  }

  const vendorCart = ensureVendorCart(req, vendorId);
  const cartItem = vendorCart.find((item) => String(item.id) === String(itemId));
  const quantity = Number.parseInt(qty, 10);

  if (cartItem) {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      req.session.cart[vendorId] = vendorCart.filter(
        (item) => String(item.id) !== String(itemId)
      );
    } else {
      cartItem.qty = quantity;
    }
  }

  try {
    await saveSession(req);
    return res.redirect("/cart");
  } catch (error) {
    return next(error);
  }
}

export async function forceSwitchCart(req, res, next) {
  const { vendorId } = req.body;

  if (!vendorId) {
    return res.status(400).json({
      success: false,
      message: "vendorId is required"
    });
  }

  req.session.cart = {};
  req.session.activeVendor = vendorId;

  try {
    await saveSession(req);
    return res.json({
      success: true,
      activeVendor: vendorId
    });
  } catch (error) {
    return next(error);
  }
}
