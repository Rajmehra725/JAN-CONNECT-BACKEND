require("dotenv").config();

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT, 10) || 5000,
  MONGODB_URI: process.env.MONGODB_URI || "mongodb+srv://infosystem:Rajd2003@cluster0.u0le37x.mongodb.net/test?retryWrites=true&w=majority",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
  JWT_SECRET: process.env.JWT_SECRET || "jan_connect_secure_jwt_dev_secret_change_in_prod",
  SUPER_ADMIN_SETUP_SECRET: process.env.SUPER_ADMIN_SETUP_SECRET || "jan_connect_bootstrap_secret_2026",
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",
};

// Validate critical configurations
function validateEnv() {
  if (env.NODE_ENV === "production") {
    if (!process.env.MONGODB_URI) {
      console.warn("WARNING: MONGODB_URI is not set in production!");
    }
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      console.warn("WARNING: JWT_SECRET should be a strong 32+ character key in production!");
    }
  }
}

validateEnv();

module.exports = env;
