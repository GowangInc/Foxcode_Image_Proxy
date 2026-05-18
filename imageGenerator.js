const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const config = require("./config");
const storage = require("./storage");

function postJson(urlString, apiKey, body, authHeader = "Authorization") {
  const bodyText = JSON.stringify(body);
  const url = new URL(urlString);
  const headers = {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(bodyText),
  };
  headers[authHeader] = authHeader === "Authorization" ? `Bearer ${apiKey}` : apiKey;

  const options = {
    method: "POST",
    hostname: url.hostname,
    port: url.port || (url.protocol === "https:" ? 443 : 80),
    path: url.pathname + url.search,
    headers,
    timeout: 180000,
  };

  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          let msg = `API returned ${res.statusCode}`;
          try {
            const err = JSON.parse(data);
            msg = err.error?.message || err.message || msg;
          } catch (_) {}
          const error = new Error(msg);
          error.statusCode = res.statusCode;
          return reject(error);
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("Failed to parse API response: " + e.message));
        }
      });
    });
    req.on("error", (e) => reject(new Error("Request failed: " + e.message)));
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
    req.write(bodyText);
    req.end();
  });
}

function normalizeImageData(result) {
  const image = result.data?.[0];
  if (image?.b64_json || image?.url) return image;

  const parts = result.candidates?.[0]?.content?.parts || result.response?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inlineData = part.inlineData || part.inline_data;
    if (inlineData?.data) return { b64_json: inlineData.data };
  }

  if (result.images?.[0]?.image_bytes) return { b64_json: result.images[0].image_bytes };
  if (result.images?.[0]?.b64_json) return { b64_json: result.images[0].b64_json };
  if (result.image?.b64_json) return { b64_json: result.image.b64_json };
  if (result.image?.url) return { url: result.image.url };

  throw new Error("No image data in API response");
}

async function generateFoxcodeImage(prompt) {
  if (!config.foxcodeApiKey) {
    return Promise.reject(new Error("API key not configured. Set FOXCODE_API_KEY environment variable."));
  }

  const result = await postJson(config.foxcodeEndpoint, config.foxcodeApiKey, {
    model: "gpt-image-2",
    prompt,
    n: 1,
    size: config.defaultSize,
    quality: config.defaultQuality,
  });
  return normalizeImageData(result);
}

async function generateGeminiImage(prompt) {
  if (!config.geminiApiKey) {
    throw new Error("Gemini API key not configured. Set GEMINI_API_KEY or FOXCODE_API_KEY.");
  }

  const baseUrl = config.geminiBaseUrl.replace(/\/$/, "");
  const endpoint = `${baseUrl}/v1beta/models/${config.geminiImageModel}:generateContent`;
  const authHeader = config.geminiAuthMechanism === "bearer" ? "Authorization" : config.geminiAuthMechanism;
  const result = await postJson(endpoint, config.geminiApiKey, {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE"],
    },
  }, authHeader);
  return normalizeImageData(result);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error) {
  return [429, 500, 502, 503, 504].includes(error.statusCode);
}

async function generateProviderWithRetries(providerName, fn, prompt) {
  let lastError = null;
  for (let attempt = 1; attempt <= config.generationRetries; attempt++) {
    try {
      const image = await fn(prompt);
      return { image, provider: providerName };
    } catch (error) {
      lastError = error;
      console.warn(`${providerName} image generation attempt ${attempt}/${config.generationRetries} failed: ${error.message}`);
      if (attempt >= config.generationRetries || !isRetryable(error)) break;
      await delay(config.generationRetryDelayMs);
    }
  }
  throw lastError;
}

async function generateImageWithRetries(prompt, providerPreference = "auto") {
  if (providerPreference === "foxcode") {
    return generateProviderWithRetries("OpenAI via Foxcode", generateFoxcodeImage, prompt);
  }
  if (providerPreference === "gemini") {
    return generateProviderWithRetries("Gemini via Foxcode", generateGeminiImage, prompt);
  }
  // Auto: try Foxcode first, fallback to Gemini
  try {
    return await generateProviderWithRetries("OpenAI via Foxcode", generateFoxcodeImage, prompt);
  } catch (foxcodeError) {
    if (!isRetryable(foxcodeError)) throw foxcodeError;
    console.warn(`OpenAI via Foxcode failed with ${foxcodeError.message}; trying Gemini fallback.`);
    return generateProviderWithRetries("Gemini via Foxcode", generateGeminiImage, prompt);
  }
}

function downloadImage(url, filePath) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { timeout: 60000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location, filePath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Image download failed with status ${res.statusCode}`));
      }
      const file = fs.createWriteStream(filePath);
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
      file.on("error", (e) => { fs.unlink(filePath, () => {}); reject(e); });
    });
    req.on("error", (e) => reject(new Error("Image download failed: " + e.message)));
    req.on("timeout", () => { req.destroy(); reject(new Error("Image download timed out")); });
  });
}

async function generateAndSave(recordId, studentName, prompt, providerPreference = "auto") {
  const filename = storage.ensureUniqueFilename(studentName, recordId, ".png");
  const filePath = storage.imagePath(filename);
  const { image, provider } = await generateImageWithRetries(prompt, providerPreference);
  if (image.b64_json) {
    fs.writeFileSync(filePath, Buffer.from(image.b64_json, "base64"));
  } else {
    await downloadImage(image.url, filePath);
  }
  try {
    const backupPath = storage.copyToPhotosBackup(filename);
    console.log(`[Backup] Saved to ${backupPath}`);
  } catch (err) {
    console.error(`[Backup] Failed to copy to Photos: ${err.message}`);
  }
  return { filename, provider };
}

module.exports = { generateAndSave };
