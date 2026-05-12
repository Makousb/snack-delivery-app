import { pool } from "../db/index.js";

/**
 * ---------------------------
 * 🧠 INIT CART
 * ---------------------------
 */
const initCart = (req, restaurantId) => {
  if (!req.session.cart) req.session.cart = {};
  if (!req.session.cart[restaurantId]) {
    req.session.cart[restaurantId] = [];
  }
};

/**
 * ---------------------------
 * ➕ ADD TO CART (FORM-BASED)
 * ---------------------------
 */
export const addToCart = async (req, res) => {
  const { id } = req.params;
  const { itemId, qty } = req.body;

  initCart(req, id);

  try {
    const menuResult = await pool.query(
      "SELECT * FROM menu_items WHERE id = $1 AND restaurant_id = $2",
      [itemId, id]
    );

    const item = menuResult.rows[0];
    if (!item) return res.status(404).send("Item not found");

    const existing = req.session.cart[id].find(i => i.id === item.id);

    if (existing) {
      existing.qty += parseInt(qty);
    } else {
      req.session.cart[id].push({
        id: item.id,
        name: item.name,
        price: item.price,
        qty: parseInt(qty)
      });
    }

    console.log("🧺 AFTER ADD (FORM):", req.session.cart);

    req.session.save(() => {
      res.redirect("back");
    });

  } catch (err) {
    console.error("addToCart error:", err);
    return res.status(500).send("Server error");
  }
};

/**
 * ---------------------------
 * ⚡ AJAX ADD TO CART
 * ---------------------------
 */
export const addToCartAjax = (req, res) => {
  const { id, name, price, qty, restaurantId, forceSwitch } = req.body;

  if (!restaurantId) {
    return res.status(400).json({ error: "Missing restaurantId" });
  }

  if (!req.session.cart) req.session.cart = {};

  const existingRestaurants = Object.keys(req.session.cart);

  if (existingRestaurants.length === 0) {
    req.session.cart[restaurantId] = [
      { id, name, price, qty: parseInt(qty) }
    ];
  } else if (req.session.cart[restaurantId]) {
    const existing = req.session.cart[restaurantId].find(i => i.id == id);

    if (existing) {
      existing.qty += parseInt(qty);
    } else {
      req.session.cart[restaurantId].push({
        id,
        name,
        price,
        qty: parseInt(qty)
      });
    }
  } else {
    if (!forceSwitch) {
      return res.json({
        switchRequired: true,
        currentRestaurant: existingRestaurants[0],
        newRestaurant: restaurantId
      });
    }

    req.session.cart = {};
    req.session.cart[restaurantId] = [
      { id, name, price, qty: parseInt(qty) }
    ];
  }

  let totalCount = 0;

  for (const rId in req.session.cart) {
    totalCount += req.session.cart[rId].reduce(
      (sum, item) => sum + item.qty,
      0
    );
  }

  console.log("🧺 AFTER ADD (AJAX):", req.session.cart);

  req.session.save(() => {
    res.json({
      cartCount: totalCount,
      switchRequired: false
    });
  });
};

/**
 * ---------------------------
 * 🧺 VIEW CART
 * ---------------------------
 */
export const viewCart = (req, res) => {
  const { id } = req.params;

  initCart(req, id);

  const cartItems = req.session.cart[id];

  const total = cartItems.reduce(
    (sum, i) => sum + i.price * i.qty,
    0
  );

  console.log("🧺 VIEW CART:", req.session.cart);

  res.render("cart", {
    title: "Your Cart",
    restaurantId: id,
    cartItems,
    total
  });
};

/**
 * ---------------------------
 * ❌ REMOVE ITEM
 * ---------------------------
 */
export const removeFromCart = (req, res) => {
  const { id } = req.params;
  const { itemId } = req.body;

  initCart(req, id);

  req.session.cart[id] = req.session.cart[id].filter(
    i => i.id != itemId
  );

  console.log("🧺 AFTER REMOVE:", req.session.cart);

  req.session.save(() => {
    res.redirect("/cart");
  });
};

/**
 * ---------------------------
 * ✏️ UPDATE QUANTITY (NEW)
 * ---------------------------
 * Used from /cart page
 * body: restaurantId, itemId, qty
 */
export const updateCartItem = (req, res) => {
  const { restaurantId, itemId, qty } = req.body;

  if (!restaurantId || !itemId) {
    return res.status(400).send("Missing data");
  }

  initCart(req, restaurantId);

  const cart = req.session.cart[restaurantId];

  const item = cart.find(i => i.id == itemId);

  if (item) {
    const newQty = parseInt(qty);

    if (newQty <= 0) {
      // remove item if qty is 0
      req.session.cart[restaurantId] = cart.filter(
        i => i.id != itemId
      );
    } else {
      item.qty = newQty;
    }
  }

  console.log("🧺 AFTER UPDATE:", req.session.cart);

  req.session.save(() => {
    res.redirect("/cart");
  });
};

/**
 * ---------------------------
 * 🔁 FORCE SWITCH CART
 * ---------------------------
 */
export const forceSwitchCart = (req, res) => {
  const { restaurantId } = req.body;

  if (!req.session.cart) req.session.cart = {};

  req.session.cart = {};
  req.session.cart[restaurantId] = [];

  console.log("🧺 AFTER FORCE SWITCH:", req.session.cart);

  req.session.save(() => {
    res.json({ success: true });
  });
};