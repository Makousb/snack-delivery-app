import express from "express";
import {
  addToCart,
  addToCartAjax,
  addUsualOrderToCart,
  applyPromo,
  deliveryEstimate,
  forceSwitchCart,
  getCartItems,
  removeFromCart,
  reorder,
  updateCartItem,
  updateCartItemAjax,
  viewCart,
  viewGlobalCart
} from "../controllers/cart.controller.js";
import { blockRoles } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.use(blockRoles(["owner", "admin", "driver"]));

router.get("/vendor/:id/cart", viewCart);
router.get("/vendor/:id/delivery-estimate", deliveryEstimate);
router.post("/vendor/:id/promo", applyPromo);
router.post("/vendor/:id/cart/add", addToCart);
router.post("/vendor/:id/cart/remove", removeFromCart);

router.get("/cart", viewGlobalCart);
router.get("/cart/items", getCartItems);
router.post("/cart/add-ajax", addToCartAjax);
router.post("/cart/update", updateCartItem);
router.post("/cart/update-ajax", updateCartItemAjax);
router.post("/cart/force-switch", forceSwitchCart);

router.post("/usual-order/add", addUsualOrderToCart);
router.post("/orders/:orderId/reorder", reorder);

export default router;
