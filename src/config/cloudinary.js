const dotenv = require("dotenv");
dotenv.config();

const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,

  params: async (req, file) => {
    const isVideo = file.mimetype.startsWith("video/");

    return {
      folder: "news_uploads",

      // Unique filename
      public_id: `${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, "")}`,

      // Supports images and videos
      resource_type: "auto",

      allowed_formats: [
        "jpg",
        "jpeg",
        "png",
        "webp",
        "mp4",
        "mov",
        "avi",
        "webm",
      ],

      // Resize images only; keep videos unchanged
      ...(isVideo
        ? {}
        : {
            transformation: [
              {
                width: 800,
                height: 500,
                crop: "limit",
              },
            ],
          }),
    };
  },
});

function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

module.exports = {
  cloudinary,
  storage,
  isCloudinaryConfigured,
};