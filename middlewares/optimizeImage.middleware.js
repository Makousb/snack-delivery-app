import sharp from "sharp";
import fs from "fs";
import path from "path";

// Display sizes for these are small: vendor logos render around 76-96px,
// and the banner is capped at a ~360px-tall hero strip (see
// .vendor-banner-shell in main.css). Resizing to these widths covers retina
// without keeping multi-megabyte camera-resolution originals on disk.
const PROFILE_IMAGE_MAX_WIDTH = {
  businessLogo: 480,
  businessBanner: 1600
};

// upload.fields() (used for the business logo/banner uploads on signup and
// the admin profile form) populates req.files, not req.file, so the
// single-file optimizeImage() below silently no-ops on these — it checks
// req.file and returns early. This is the req.files equivalent: one resized,
// compressed JPEG per field, no responsive multi-size set (these are only
// ever rendered as a single <img>, unlike menu item photos).
export async function optimizeProfileImages(req, res, next) {
  if (!req.files) {
    return next();
  }

  try {
    const imagesDir = path.join(process.cwd(), "public", "images");

    for (const field of Object.keys(req.files)) {
      const file = req.files[field]?.[0];
      if (!file) continue;

      const maxWidth = PROFILE_IMAGE_MAX_WIDTH[field] || 1200;
      const filename = path.parse(file.filename).name;
      const optimizedFilename = `${filename}-optimized.jpg`;
      const optimizedPath = path.join(imagesDir, optimizedFilename);

      await sharp(file.path)
        .resize({ width: maxWidth, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(optimizedPath);

      fs.unlinkSync(file.path);

      file.filename = optimizedFilename;
      file.path = optimizedPath;
    }

    next();
  } catch (error) {
    console.error("Profile image optimization failed:", error);
    next(error);
  }
}

export async function optimizeImage(req, res, next) {
  try {

    if (!req.file) {
      return next();
    }

    const uploadPath = req.file.path;
    const imagesDir = path.join(process.cwd(), "public", "images");

    const filename = path.parse(req.file.filename).name;

    const smallPath = path.join(imagesDir, `${filename}-400.jpg`);
    const mediumPath = path.join(imagesDir, `${filename}-800.jpg`);
    const largePath = path.join(imagesDir, `${filename}-1200.jpg`);
    const webpPath = path.join(imagesDir, `${filename}.webp`);

    // Small (mobile)
    await sharp(uploadPath)
      .resize({ width: 400 })
      .jpeg({ quality: 70 })
      .toFile(smallPath);

    // Medium (default image used by DB)
    await sharp(uploadPath)
      .resize({ width: 800 })
      .jpeg({ quality: 75 })
      .toFile(mediumPath);

    // Large (desktop)
    await sharp(uploadPath)
      .resize({ width: 1200 })
      .jpeg({ quality: 80 })
      .toFile(largePath);

    // WebP version
    await sharp(uploadPath)
      .resize({ width: 800 })
      .webp({ quality: 70 })
      .toFile(webpPath);

    // Delete original upload
    fs.unlinkSync(uploadPath);

    // Replace multer filename with optimized one
    req.file.filename = `${filename}-800.jpg`;
    req.file.path = mediumPath;

    next();

  } catch (error) {

    console.error("Image optimization failed:", error);
    next(error);

  }
}
