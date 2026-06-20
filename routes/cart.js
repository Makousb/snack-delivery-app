import express from "express";
import {
  addToCart,
  addToCartAjax,
  forceSwitchCart,
  removeFromCart,
  updateCartItem,
  viewCart,
  viewGlobalCart
} from "../controllers/cart.controller.js";

const router = express.Router();

router.get("/vendor/:id/cart", viewCart);
router.post("/vendor/:id/cart/add", addToCart);
router.post("/vendor/:id/cart/remove", removeFromCart);

router.get("/cart", viewGlobalCart);
router.post("/cart/add-ajax", addToCartAjax);
router.post("/cart/update", updateCartItem);
router.post("/cart/force-switch", forceSwitchCart);

export default router;
