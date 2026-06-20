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

router.get("/restaurant/:id/cart", viewCart);
router.post("/restaurant/:id/cart/add", addToCart);
router.post("/restaurant/:id/cart/remove", removeFromCart);

router.get("/cart", viewGlobalCart);
router.post("/cart/add-ajax", addToCartAjax);
router.post("/cart/update", updateCartItem);
router.post("/cart/force-switch", forceSwitchCart);

export default router;
