import express from "express";
import {
  renderLanding,
  renderDriverLanding,
  renderVendorLanding,
  renderMenu,
  showVendor,
  renderHome,
  renderStreetVendors,
  renderAllVendors,
  searchVendors,
  showContact,
  submitContact,
  showAbout
} from "../controllers/public.controller.js";

const router = express.Router();

router.get("/", renderLanding);
router.get("/drive", renderDriverLanding);
router.get("/partner", renderVendorLanding);
router.get("/home", renderHome);
router.get("/street-vendors", renderStreetVendors);

router.get("/about", showAbout);
router.get("/contact", showContact);
router.post("/contact", submitContact);

router.get("/vendors", renderAllVendors);
router.get("/vendors/search", searchVendors);

router.get("/vendor/:id/menu", renderMenu);
router.get("/vendor/:id", showVendor);

export default router;
