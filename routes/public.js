import express from "express";
import {
  renderLanding,
  renderMenu,
  showRestaurant,
  renderHome,
  searchRestaurant,
  showContact,
  submitContact,
  showAbout
} from "../controllers/public.controller.js";

const router = express.Router();

router.get("/", renderLanding);
router.get("/home", renderHome);

router.get("/about", showAbout);
router.get("/contact", showContact);
router.post("/contact", submitContact);

router.get("/restaurants/search", searchRestaurant);

router.get("/restaurant/:id/menu", renderMenu);
router.get("/restaurant/:id", showRestaurant);

export default router;

