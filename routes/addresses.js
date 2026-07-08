import express from "express";
import {
  renderAddresses,
  createAddress,
  removeAddress,
  makeDefaultAddress
} from "../controllers/address.controller.js";
import { blockRoles } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Address book is a shopper feature.
router.use(blockRoles(["owner", "admin", "driver"]));

router.get("/", renderAddresses);
router.post("/", createAddress);
router.post("/:id/delete", removeAddress);
router.post("/:id/default", makeDefaultAddress);

export default router;
