const path = require("path");
const os = require("os");

const ROOT = __dirname;

module.exports = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || "0.0.0.0",
  imagesDir: path.join(ROOT, "images"),
  dataDir: path.join(ROOT, "data"),
  metadataFile: path.join(ROOT, "data", "images.json"),
  photosBackupDir: process.env.PHOTOS_BACKUP_DIR || path.join(os.homedir(), "Photos", "image2_webserver"),
  adminPassword: process.env.ADMIN_PASSWORD || "admin",
  foxcodeApiKey: process.env.FOXCODE_API_KEY || process.env.OPENAI_API_KEY || null,
  foxcodeEndpoint: "https://dm-fox.rjj.cc/codex/v1/images/generations",
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.FOXCODE_API_KEY || process.env.OPENAI_API_KEY || null,
  geminiBaseUrl: process.env.GOOGLE_GEMINI_BASE_URL || "https://code.newcli.com/gemini",
  geminiImageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image",
  geminiAuthMechanism: process.env.GEMINI_API_KEY_AUTH_MECHANISM || "x-goog-api-key",
  defaultSize: process.env.IMAGE_SIZE || "1536x1024",
  defaultQuality: process.env.IMAGE_QUALITY || "high",
  generationRetries: Number(process.env.GENERATION_RETRIES || 3),
  generationRetryDelayMs: Number(process.env.GENERATION_RETRY_DELAY_MS || 5000),
  queueDelayMs: Number(process.env.QUEUE_DELAY_MS || 10000),
};
