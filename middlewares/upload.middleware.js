import multer from "multer";
import path from "path";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(process.cwd(), "public", "images"));
  },
  filename: function (req, file, cb) {
    // Strip any path components and collapse unsafe characters so an uploaded
    // filename can't escape the images directory or break later processing.
    const safeName = path
      .basename(file.originalname)
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  }
});

function fileFilter(req, file, cb) {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
}

export const upload = multer({
  storage,
  fileFilter,
  // Cap uploads so a single request can't fill the disk. Sharp downscales
  // these afterward, so the originals never need to be camera-resolution.
  limits: {
    fileSize: 8 * 1024 * 1024, // 8 MB per file
    files: 2
  }
});
