import express from "express";
import {
  addToCart,
  viewCart,
  removeFromCart,
  addToCartAjax
} from "../controllers/cart.controller.js";

console.log("🧺 cartRoutes file loaded");

const router = express.Router();

/* =========================================================
   🧺 LEGACY / PAGE-BASED CART ROUTES (still supported)
   ========================================================= */

// View cart for a specific restaurant (old flow)
router.get("/restaurant/:id/cart", viewCart);

// Add item (non-AJAX form submission)
router.post("/restaurant/:id/cart/add", addToCart);

// Remove item (non-AJAX form submission)
router.post("/restaurant/:id/cart/remove", removeFromCart);


/* =========================================================
   ⚡ MODERN AJAX CART SYSTEM (PRIMARY FLOW)
   ========================================================= */

// Add to cart via AJAX
router.post("/cart/add-ajax", addToCartAjax);


/* =========================================================
   🛒 GLOBAL CART PAGE (/cart)
   ========================================================= */

router.get("/cart", (req, res) => {
  console.log("🔥 /cart route was HIT");
  console.log("🧠 SESSION:", req.session);
  console.log("🧺 SESSION CART:", req.session.cart);

  const groupedCart = req.session.cart || {};

  const cartItems = Object.entries(groupedCart).flatMap(
    ([restaurantId, items]) => {
      return items.map(item => ({
        ...item,
        restaurantId
      }));
    }
  );

  const total = cartItems.reduce((sum, item) => {
    return sum + (item.price * item.qty);
  }, 0);

  res.render("cart", {
    title: "Your Cart",
    cartItems,
    total,
    restaurantId: cartItems[0]?.restaurantId || null
  });
});


/* =========================================================
   🔁 UPDATE ITEM QUANTITY (NEW FEATURE)
   ========================================================= */

router.post("/cart/update", (req, res) => {
  const { restaurantId, itemId, qty } = req.body;

  if (!req.session.cart?.[restaurantId]) {
    return res.redirect("/cart");
  }

  const item = req.session.cart[restaurantId].find(
    i => i.id == itemId
  );

  if (item) {
    const newQty = parseInt(qty);

    if (newQty <= 0) {
      // remove item
      req.session.cart[restaurantId] =
        req.session.cart[restaurantId].filter(i => i.id != itemId);
    } else {
      item.qty = newQty;
    }
  }

  req.session.save(() => {
    res.redirect("/cart");
  });
});


/* =========================================================
   🧨 FORCE SWITCH (restaurant change confirmation)
   ========================================================= */

router.post("/cart/force-switch", (req, res) => {
  const { restaurantId } = req.body;

  if (!restaurantId) {
    return res.status(400).json({
      success: false,
      message: "restaurantId is required"
    });
  }

  req.session.cart = {};
  req.session.activeRestaurant = restaurantId;

  return res.json({
    success: true,
    activeRestaurant: restaurantId
  });
});


export default router;