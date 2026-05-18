const fs = require("fs");
const path = require("path");
const config = require("./config");

const filtersFile = path.join(config.dataDir, "moderation-filters.json");

const defaultFilters = {
  blockedTerms: [
    "nude", "naked", "nsfw", "porn", "sexy", "sex", "erotic", "fetish",
    "blood", "gore", "graphic violence", "decapitated", "dismembered",
    "gun", "rifle", "pistol", "knife", "weapon", "shooting", "bomb",
    "drug", "cocaine", "meth", "weed", "marijuana", "vape", "alcohol", "beer",
    "suicide", "self harm", "kill myself", "hang myself",
    "hate symbol", "swastika", "racist", "slur"
  ],
  blockedPatterns: [
    "\\bkill\\b.*\\b(person|people|student|teacher|kid|child)\\b",
    "\\bdead\\b.*\\b(body|person|people|student|teacher|kid|child)\\b",
    "\\b(realistic|photorealistic)\\b.*\\b(injury|wound|blood)\\b"
  ]
};

function ensureFiltersFile() {
  if (!fs.existsSync(config.dataDir)) fs.mkdirSync(config.dataDir, { recursive: true });
  if (!fs.existsSync(filtersFile)) {
    fs.writeFileSync(filtersFile, JSON.stringify(defaultFilters, null, 2), "utf-8");
  }
}

function getFilters() {
  ensureFiltersFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(filtersFile, "utf-8"));
    return {
      blockedTerms: Array.isArray(parsed.blockedTerms) ? parsed.blockedTerms : defaultFilters.blockedTerms,
      blockedPatterns: Array.isArray(parsed.blockedPatterns) ? parsed.blockedPatterns : defaultFilters.blockedPatterns,
    };
  } catch (_) {
    return defaultFilters;
  }
}

function saveFilters(filters) {
  ensureFiltersFile();
  const normalized = {
    blockedTerms: Array.isArray(filters.blockedTerms) ? filters.blockedTerms.map((t) => String(t).trim()).filter(Boolean) : [],
    blockedPatterns: Array.isArray(filters.blockedPatterns) ? filters.blockedPatterns.map((p) => String(p).trim()).filter(Boolean) : [],
  };
  fs.writeFileSync(filtersFile, JSON.stringify(normalized, null, 2), "utf-8");
  return normalized;
}

function normalizeText(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function assessPrompt(prompt) {
  const filters = getFilters();
  const text = normalizeText(prompt);
  const reasons = [];

  for (const term of filters.blockedTerms) {
    const normalizedTerm = normalizeText(term);
    if (normalizedTerm && text.includes(normalizedTerm)) {
      reasons.push(`Matched term: ${term}`);
    }
  }

  for (const pattern of filters.blockedPatterns) {
    try {
      const re = new RegExp(pattern, "i");
      if (re.test(prompt)) reasons.push(`Matched pattern: ${pattern}`);
    } catch (_) {}
  }

  return {
    flagged: reasons.length > 0,
    status: reasons.length > 0 ? "pending" : "approved",
    reasons,
  };
}

function publicSafe(record) {
  return record.status === "complete" && record.imageUrl && record.moderationStatus === "approved";
}

module.exports = {
  assessPrompt,
  getFilters,
  saveFilters,
  publicSafe,
};
