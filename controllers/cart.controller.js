import { pool } from "../db/index.js";
import {
  calculateCartTotal,
  ensureVendorCart,
  flattenCart,
  getPositiveQuantity
} from "../utils/cart.js";
import { getUsualOrder } from "../db/queries/usualOrder.js";

// Replace the whole cart with a single vendor's items. Used by the "usual
// order" and "order again" flows, which always start a fresh cart (the cart
// is one-vendor-at-a-time, so loading a saved order supersedes any current
// contents).
function setVendorCart(req, vendorId, items) {
  req.session.cart = {
    [String(vendorId)]: items.map((item) => ({
      id: item.id,
      name: item.name,
      price: Number(item.price),
      qty: getPositiveQuantity(item.qty)
    }))
  };
}

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
    "SELECT id, name, price, status FROM menu_items WHERE id = $1 AND vendor_id = $2",
    [itemId, vendorId]
  );

  return result.rows[0];
}

function isAvailable(menuItem) {
  return menuItem?.status === "Available";
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

    if (!isAvailable(menuItem)) {
      req.flash("error", `${menuItem.name} is currently unavailable.`);
      return res.redirect(req.get("Referrer") || `/vendor/${vendorId}/menu`);
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

    if (!isAvailable(menuItem)) {
      return res.status(409).json({ error: `${menuItem.name} is currently unavailable.` });
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

function buildCartPayload(req) {
  const items = flattenCart(req.session.cart || {});
  const total = calculateCartTotal(items);
  const count = items.reduce((sum, item) => sum + item.qty, 0);

  return { items, total, count };
}

export function getCartItems(req, res) {
  return res.json(buildCartPayload(req));
}

export async function updateCartItemAjax(req, res, next) {
  const { vendorId, itemId, qty } = req.body;

  if (!vendorId || !itemId) {
    return res.status(400).json({ error: "Missing cart item data" });
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
    return res.json(buildCartPayload(req));
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

export async function addUsualOrderToCart(req, res, next) {
  const userId = req.session.user?.id;

  if (!userId) {
    req.flash("error", "Log in to order your usual.");
    return res.redirect("/auth/login");
  }

  try {
    const usual = await getUsualOrder(userId);

    if (!usual) {
      req.flash("error", "We couldn't find a usual order for you yet.");
      return res.redirect("/home");
    }

    setVendorCart(req, usual.vendor.id, usual.items);
    await saveSession(req);

    req.flash("success", `Added your usual from ${usual.vendor.name} to the cart.`);
    return res.redirect("/cart");
  } catch (error) {
    return next(error);
  }
}

export async function reorder(req, res, next) {
  const userId = req.session.user?.id;
  const { orderId } = req.params;

  if (!userId) {
    req.flash("error", "Log in to reorder.");
    return res.redirect("/auth/login");
  }

  try {
    const orderResult = await pool.query(
      "SELECT id, vendor_id, user_id FROM orders WHERE id = $1",
      [orderId]
    );
    const order = orderResult.rows[0];

    if (!order || order.user_id !== userId) {
      req.flash("error", "Order not found.");
      return res.redirect("/orders");
    }

    const itemsResult = await pool.query(
      `SELECT mi.id, mi.name, mi.price, oi.quantity AS qty
       FROM order_items oi
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id = $1
         AND mi.status = 'Available'
       ORDER BY oi.id ASC`,
      [orderId]
    );

    if (itemsResult.rows.length === 0) {
      req.flash("error", "None of that order's items are available right now.");
      return res.redirect("/orders");
    }

    setVendorCart(req, order.vendor_id, itemsResult.rows);
    await saveSession(req);

    req.flash("success", "Added those items to your cart.");
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
