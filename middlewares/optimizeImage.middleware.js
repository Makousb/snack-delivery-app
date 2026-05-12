import sharp from "sharp";
import fs from "fs";
import path from "path";

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
