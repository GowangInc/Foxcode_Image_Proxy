const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const config = require("./config");

const approvedFile = path.join(config.dataDir, "approved.json");
const blocklistFile = path.join(config.dataDir, "blocklist.json");
const adminTokensFile = path.join(config.dataDir, "admin-tokens.json");

let pendingRequests = [];
let approvedTokens = new Map();
let blocklist = new Set();
let activeSessions = new Set();
let adminTokens = new Map();
let adminEnrollmentCodes = new Map();

function ensureAuthFiles() {
  if (!fs.existsSync(config.dataDir)) fs.mkdirSync(config.dataDir, { recursive: true });
  if (!fs.existsSync(approvedFile)) fs.writeFileSync(approvedFile, "[]");
  if (!fs.existsSync(blocklistFile)) fs.writeFileSync(blocklistFile, "[]");
  if (!fs.existsSync(adminTokensFile)) fs.writeFileSync(adminTokensFile, "[]");
}

function loadApproved() {
  ensureAuthFiles();
  try {
    const data = JSON.parse(fs.readFileSync(approvedFile, "utf-8"));
    approvedTokens.clear();
    for (const entry of data) {
      approvedTokens.set(entry.token, entry);
    }
  } catch (_) {}
}

function saveApproved() {
  ensureAuthFiles();
  const data = Array.from(approvedTokens.values());
  fs.writeFileSync(approvedFile, JSON.stringify(data, null, 2));
}

function loadBlocklist() {
  ensureAuthFiles();
  try {
    const data = JSON.parse(fs.readFileSync(blocklistFile, "utf-8"));
    blocklist = new Set(data.map((e) => e.studentName));
  } catch (_) {}
}

function saveBlocklist() {
  ensureAuthFiles();
  const data = Array.from(blocklist).map((name) => ({ studentName: name, blockedAt: new Date().toISOString() }));
  fs.writeFileSync(blocklistFile, JSON.stringify(data, null, 2));
}

function loadAdminTokens() {
  ensureAuthFiles();
  try {
    const data = JSON.parse(fs.readFileSync(adminTokensFile, "utf-8"));
    adminTokens.clear();
    for (const entry of data) {
      adminTokens.set(entry.token, entry);
    }
  } catch (_) {}
}

function saveAdminTokens() {
  ensureAuthFiles();
  fs.writeFileSync(adminTokensFile, JSON.stringify(Array.from(adminTokens.values()), null, 2));
}

function requestLogin(studentName) {
  studentName = studentName.trim();
  if (blocklist.has(studentName)) {
    return { status: "blocked", error: "Access denied. Contact teacher." };
  }
  
  const existing = pendingRequests.find((r) => r.studentName === studentName);
  if (existing) {
    return { status: "pending", message: "Already waiting for approval." };
  }
  
  const request = {
    id: uuidv4(),
    studentName,
    requestTime: new Date().toISOString(),
  };
  pendingRequests.push(request);
  return { status: "pending", message: "Waiting for teacher approval...", request };
}

function approveRequest(requestId) {
  const idx = pendingRequests.findIndex((r) => r.id === requestId);
  if (idx === -1) return null;
  
  const request = pendingRequests[idx];
  pendingRequests.splice(idx, 1);
  
  const token = uuidv4();
  const entry = {
    token,
    studentName: request.studentName,
    approvedAt: new Date().toISOString(),
  };
  approvedTokens.set(token, entry);
  saveApproved();
  
  return { token, studentName: request.studentName };
}

function denyRequest(requestId) {
  const idx = pendingRequests.findIndex((r) => r.id === requestId);
  if (idx === -1) return false;
  
  const request = pendingRequests[idx];
  pendingRequests.splice(idx, 1);
  blocklist.add(request.studentName);
  saveBlocklist();
  return true;
}

function checkToken(token) {
  const entry = approvedTokens.get(token);
  if (!entry) return { valid: false };
  if (blocklist.has(entry.studentName)) return { valid: false, blocked: true };
  return { valid: true, studentName: entry.studentName };
}

function kickStudent(studentName) {
  activeSessions.delete(studentName);
  for (const [token, entry] of approvedTokens) {
    if (entry.studentName === studentName) {
      approvedTokens.delete(token);
    }
  }
  blocklist.add(studentName);
  saveApproved();
  saveBlocklist();
  return true;
}

function clearAllApproved() {
  approvedTokens.clear();
  activeSessions.clear();
  saveApproved();
}

function unblockStudent(studentName) {
  const removed = blocklist.delete(studentName);
  if (removed) saveBlocklist();
  return removed;
}

function getPendingRequests() {
  return pendingRequests;
}

function getActiveStudents() {
  return Array.from(activeSessions).map((name) => ({ studentName: name }));
}

function getApprovedStudents() {
  const byName = new Map();
  for (const entry of approvedTokens.values()) {
    if (!byName.has(entry.studentName)) {
      byName.set(entry.studentName, {
        studentName: entry.studentName,
        approvedAt: entry.approvedAt,
      });
    }
  }
  return Array.from(byName.values()).sort((a, b) => a.studentName.localeCompare(b.studentName));
}

function getBlocklist() {
  return Array.from(blocklist).map((name) => ({ studentName: name }));
}

function markActive(studentName) {
  activeSessions.add(studentName);
}

function markInactive(studentName) {
  activeSessions.delete(studentName);
}

function hasAdminTokens() {
  return adminTokens.size > 0;
}

function issueAdminToken(label = "Admin browser") {
  const token = uuidv4();
  const now = new Date().toISOString();
  const entry = {
    token,
    label: String(label || "Admin browser").trim().slice(0, 80),
    createdAt: now,
    lastUsedAt: now,
  };
  adminTokens.set(token, entry);
  saveAdminTokens();
  return entry;
}

function checkAdminToken(token) {
  const entry = adminTokens.get(token);
  if (!entry) return { valid: false };
  entry.lastUsedAt = new Date().toISOString();
  saveAdminTokens();
  return { valid: true, token: entry.token, label: entry.label };
}

function listAdminTokens() {
  return Array.from(adminTokens.values()).map(({ token, label, createdAt, lastUsedAt }) => ({
    tokenSuffix: token.slice(-8),
    label,
    createdAt,
    lastUsedAt,
  }));
}

function revokeAdminToken(token) {
  const removed = adminTokens.delete(token);
  if (removed) saveAdminTokens();
  return removed;
}

function clearAdminTokens() {
  adminTokens.clear();
  adminEnrollmentCodes.clear();
  saveAdminTokens();
}

function generateAdminEnrollmentCode(createdBy = "admin") {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const now = Date.now();
  const entry = {
    code,
    createdBy,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
  };
  adminEnrollmentCodes.set(code, entry);
  return entry;
}

function consumeAdminEnrollmentCode(code) {
  const normalized = String(code || "").trim();
  const entry = adminEnrollmentCodes.get(normalized);
  if (!entry) return { valid: false, error: "Invalid enrollment code" };
  if (Date.now() > new Date(entry.expiresAt).getTime()) {
    adminEnrollmentCodes.delete(normalized);
    return { valid: false, error: "Enrollment code expired" };
  }
  adminEnrollmentCodes.delete(normalized);
  return { valid: true };
}

loadApproved();
loadBlocklist();
loadAdminTokens();

module.exports = {
  requestLogin,
  approveRequest,
  denyRequest,
  checkToken,
  kickStudent,
  clearAllApproved,
  unblockStudent,
  getPendingRequests,
  getActiveStudents,
  getApprovedStudents,
  getBlocklist,
  markActive,
  markInactive,
  hasAdminTokens,
  issueAdminToken,
  checkAdminToken,
  listAdminTokens,
  revokeAdminToken,
  clearAdminTokens,
  generateAdminEnrollmentCode,
  consumeAdminEnrollmentCode,
};
