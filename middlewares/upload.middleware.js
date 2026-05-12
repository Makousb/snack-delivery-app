import multer from "multer";
import path from "path";
import fs from "fs";
import sharp from "sharp";

// ---------------------
// Multer Storage (existing folder)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/images");
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  }
});

// File filter (images only)
function fileFilter(req, file, cb) {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
}

export const upload = multer({
  storage,
  fileFilter
});

// ---------------------
// Image optimizer middleware
// ---------------------
export async function optimizeImage(req, res, next) {
  if (!req.file) return next();

  try {
    const imagePath = path.join(process.cwd(), "public", "images", req.file.filename);
    
    // Resize to max width 800px and compress JPEG
    await sharp(imagePath)
      .resize({ width: 800 })
      .jpeg({ quality: 80 })
      .toBuffer()
      .then(data => fs.writeFileSync(imagePath, data));

    next();
  } catch (err) {
    console.error("Image optimization failed:", err);
    next(err);
  }
}
