import { pool } from "../db/index.js";
import {
  calculateCartTotal,
  ensureRestaurantCart,
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

async function getMenuItem(itemId, restaurantId) {
  const result = await pool.query(
    "SELECT id, name, price FROM menu_items WHERE id = $1 AND restaurant_id = $2",
    [itemId, restaurantId]
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
  const { id: restaurantId } = req.params;
  const { itemId, qty } = req.body;
  const quantity = getPositiveQuantity(qty);

  try {
    const menuItem = await getMenuItem(itemId, restaurantId);

    if (!menuItem) {
      return res.status(404).send("Item not found");
    }

    const restaurantCart = ensureRestaurantCart(req, restaurantId);
    upsertCartItem(restaurantCart, menuItem, quantity);

    await saveSession(req);
    return res.redirect(req.get("Referrer") || `/restaurant/${restaurantId}/menu`);
  } catch (error) {
    return next(error);
  }
}

export async function addToCartAjax(req, res, next) {
  const { id, qty, restaurantId, forceSwitch } = req.body;
  const quantity = getPositiveQuantity(qty);

  if (!restaurantId) {
    return res.status(400).json({ error: "Missing restaurantId" });
  }

  try {
    const menuItem = await getMenuItem(id, restaurantId);

    if (!menuItem) {
      return res.status(404).json({ error: "Item not found" });
    }

    if (!req.session.cart) {
      req.session.cart = {};
    }

    const existingRestaurantIds = Object.keys(req.session.cart).filter(
      (currentRestaurantId) => req.session.cart[currentRestaurantId]?.length
    );

    if (
      existingRestaurantIds.length > 0 &&
      !req.session.cart[restaurantId] &&
      !forceSwitch
    ) {
      return res.json({
        switchRequired: true,
        currentRestaurant: existingRestaurantIds[0],
        newRestaurant: restaurantId
      });
    }

    if (forceSwitch) {
      req.session.cart = {};
    }

    const restaurantCart = ensureRestaurantCart(req, restaurantId);
    upsertCartItem(restaurantCart, menuItem, quantity);

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
  const { id: restaurantId } = req.params;
  const cartItems = ensureRestaurantCart(req, restaurantId);
  const total = calculateCartTotal(cartItems);

  return res.render("cart", {
    title: "Your Cart",
    restaurantId,
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
    restaurantId: cartItems[0]?.restaurantId || null
  });
}

export async function removeFromCart(req, res, next) {
  const { id: restaurantId } = req.params;
  const { itemId } = req.body;
  const restaurantCart = ensureRestaurantCart(req, restaurantId);

  req.session.cart[restaurantId] = restaurantCart.filter(
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
  const { restaurantId, itemId, qty } = req.body;

  if (!restaurantId || !itemId) {
    return res.status(400).send("Missing cart item data");
  }

  const restaurantCart = ensureRestaurantCart(req, restaurantId);
  const cartItem = restaurantCart.find((item) => String(item.id) === String(itemId));
  const quantity = Number.parseInt(qty, 10);

  if (cartItem) {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      req.session.cart[restaurantId] = restaurantCart.filter(
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
  const { restaurantId } = req.body;

  if (!restaurantId) {
    return res.status(400).json({
      success: false,
      message: "restaurantId is required"
    });
  }

  req.session.cart = {};
  req.session.activeRestaurant = restaurantId;

  try {
    await saveSession(req);
    return res.json({
      success: true,
      activeRestaurant: restaurantId
    });
  } catch (error) {
    return next(error);
  }
}
