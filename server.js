require("dotenv").config();
const express = require("express");
const path = require("path");
const config = require("./config");
const storage = require("./storage");
const queue = require("./queue");
const auth = require("./auth");
const moderation = require("./moderation");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(express.static(path.join(__dirname, "public")));
app.use("/images", express.static(config.imagesDir));

// Auth endpoints for student approval flow
app.post("/api/request-login", (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "Name is required" });
  }
  const result = auth.requestLogin(name.trim());
  res.json(result);
});

app.post("/api/check-token", (req, res) => {
  const { token } = req.body;
  if (!token) return res.json({ valid: false });
  const result = auth.checkToken(token);
  res.json(result);
});

function getAdminPassword(req) {
  return req.query.password || req.body?.password || "";
}

function getAdminToken(req) {
  return req.query.adminToken || req.body?.adminToken || req.get("x-admin-token") || "";
}

function adminAuthorized(req) {
  if (getAdminPassword(req) !== config.adminPassword) {
    return { ok: false, status: 403, error: "Invalid admin password" };
  }
  if (!auth.hasAdminTokens()) {
    return { ok: true, needsEnrollment: true };
  }
  const tokenCheck = auth.checkAdminToken(getAdminToken(req));
  if (!tokenCheck.valid) {
    return { ok: false, status: 403, error: "This browser is not trusted for admin access" };
  }
  return { ok: true };
}

function requireAdmin(req, res, next) {
  const result = adminAuthorized(req);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  next();
}

app.post("/api/admin/login", (req, res) => {
  if (getAdminPassword(req) !== config.adminPassword) {
    return res.status(403).json({ error: "Invalid admin password" });
  }
  const enrollmentCode = String(req.body?.enrollmentCode || "").trim();
  if (enrollmentCode) {
    const codeResult = auth.consumeAdminEnrollmentCode(enrollmentCode);
    if (!codeResult.valid) return res.status(403).json({ error: codeResult.error });
    const entry = auth.issueAdminToken(req.body?.label || "Admin browser");
    return res.json({ ok: true, enrolled: true, adminToken: entry.token, label: entry.label });
  }
  const result = adminAuthorized(req);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  if (result.needsEnrollment) {
    const entry = auth.issueAdminToken(req.body?.label || "Admin browser");
    return res.json({ ok: true, enrolled: true, adminToken: entry.token, label: entry.label });
  }
  res.json({ ok: true, enrolled: false });
});

app.post("/api/admin/check-token", (req, res) => {
  const tokenCheck = auth.checkAdminToken(getAdminToken(req));
  res.json(tokenCheck.valid ? { valid: true, label: tokenCheck.label } : { valid: false });
});

app.use("/api/admin", requireAdmin);

app.get("/api/admin/tokens", (req, res) => {
  res.json(auth.listAdminTokens());
});

app.post("/api/admin/tokens/clear", (req, res) => {
  auth.clearAdminTokens();
  res.json({ ok: true });
});

app.post("/api/admin/enrollment-code", (req, res) => {
  res.json(auth.generateAdminEnrollmentCode("admin"));
});

// Admin auth management
app.get("/api/admin/pending", (req, res) => {
  const pwd = req.query.password || "";
  if (pwd !== config.adminPassword) return res.status(403).json({ error: "Invalid admin password" });
  res.json(auth.getPendingRequests());
});

app.post("/api/admin/approve/:id", (req, res) => {
  const pwd = req.query.password || "";
  if (pwd !== config.adminPassword) return res.status(403).json({ error: "Invalid admin password" });
  const result = auth.approveRequest(req.params.id);
  if (!result) return res.status(404).json({ error: "Request not found" });
  res.json({ ok: true, token: result.token, studentName: result.studentName });
});

app.post("/api/admin/deny/:id", (req, res) => {
  const pwd = req.query.password || "";
  if (pwd !== config.adminPassword) return res.status(403).json({ error: "Invalid admin password" });
  const ok = auth.denyRequest(req.params.id);
  if (!ok) return res.status(404).json({ error: "Request not found" });
  res.json({ ok: true });
});

app.get("/api/admin/students", (req, res) => {
  const pwd = req.query.password || "";
  if (pwd !== config.adminPassword) return res.status(403).json({ error: "Invalid admin password" });
  res.json({
    approved: auth.getApprovedStudents(),
    active: auth.getActiveStudents(),
    pending: auth.getPendingRequests(),
    blocked: auth.getBlocklist(),
  });
});

app.get("/api/admin/approved-students", (req, res) => {
  const pwd = req.query.password || "";
  if (pwd !== config.adminPassword) return res.status(403).json({ error: "Invalid admin password" });
  res.json(auth.getApprovedStudents());
});

app.post("/api/admin/kick", (req, res) => {
  const pwd = req.query.password || "";
  if (pwd !== config.adminPassword) return res.status(403).json({ error: "Invalid admin password" });
  const { studentName } = req.body;
  if (!studentName) return res.status(400).json({ error: "studentName required" });
  auth.kickStudent(studentName);
  res.json({ ok: true });
});

app.post("/api/admin/clear-approved", (req, res) => {
  const pwd = req.query.password || "";
  if (pwd !== config.adminPassword) return res.status(403).json({ error: "Invalid admin password" });
  auth.clearAllApproved();
  res.json({ ok: true });
});

app.get("/api/admin/blocklist", (req, res) => {
  const pwd = req.query.password || "";
  if (pwd !== config.adminPassword) return res.status(403).json({ error: "Invalid admin password" });
  res.json(auth.getBlocklist());
});

app.delete("/api/admin/blocklist/:studentName", (req, res) => {
  const pwd = req.query.password || "";
  if (pwd !== config.adminPassword) return res.status(403).json({ error: "Invalid admin password" });
  const ok = auth.unblockStudent(req.params.studentName);
  if (!ok) return res.status(404).json({ error: "Student not found in blocklist" });
  res.json({ ok: true });
});

// Legacy signin endpoint (still used after approval)
app.post("/api/signin", (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "Name is required" });
  }
  auth.markActive(name.trim());
  res.json({ name: name.trim() });
});

app.post("/api/generate", async (req, res) => {
  const { studentName, prompt, provider } = req.body;
  if (!studentName || !prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return res.status(400).json({ error: "Student name and prompt are required" });
  }
  try {
    const result = await queue.enqueue(studentName.trim(), prompt.trim(), provider || "auto");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/images", (req, res) => {
  const studentName = req.query.studentName;
  if (!studentName) {
    return res.status(400).json({ error: "studentName query param required" });
  }
  const images = storage.getStudentImages(studentName.trim()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(images);
});

app.get("/api/public/gallery", (req, res) => {
  const images = storage.getPublicImages().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(images);
});

app.delete("/api/images/:id", (req, res) => {
  const { id } = req.params;
  const studentName = req.query.studentName;
  if (!studentName) {
    return res.status(400).json({ error: "studentName query param required" });
  }
  const record = storage.getStudentImages(studentName.trim()).find((r) => r.id === id);
  if (!record) {
    return res.status(404).json({ error: "Image not found" });
  }
  storage.deleteRecord(id);
  res.json({ ok: true });
});

app.get("/api/admin/images", (req, res) => {
  const pwd = req.query.password || "";
  if (pwd !== config.adminPassword) {
    return res.status(403).json({ error: "Invalid admin password" });
  }
  const images = storage.getAllImages().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(images);
});

app.get("/api/admin/moderation", (req, res) => {
  const pwd = req.query.password || "";
  if (pwd !== config.adminPassword) {
    return res.status(403).json({ error: "Invalid admin password" });
  }
  const status = req.query.status || "pending";
  res.json(storage.getModerationImages(status));
});

app.post("/api/admin/moderate/:id", (req, res) => {
  const pwd = req.query.password || "";
  if (pwd !== config.adminPassword) {
    return res.status(403).json({ error: "Invalid admin password" });
  }
  const { status, note } = req.body || {};
  const record = storage.moderateRecord(req.params.id, status, "admin", note || "");
  if (!record) return res.status(400).json({ error: "Invalid moderation request" });
  res.json(record);
});

app.get("/api/admin/moderation-filters", (req, res) => {
  const pwd = req.query.password || "";
  if (pwd !== config.adminPassword) {
    return res.status(403).json({ error: "Invalid admin password" });
  }
  res.json(moderation.getFilters());
});

app.post("/api/admin/moderation-filters", (req, res) => {
  const pwd = req.query.password || "";
  if (pwd !== config.adminPassword) {
    return res.status(403).json({ error: "Invalid admin password" });
  }
  res.json(moderation.saveFilters(req.body || {}));
});

app.delete("/api/admin/images", (req, res) => {
  const pwd = req.query.password || req.body.password || "";
  if (pwd !== config.adminPassword) {
    return res.status(403).json({ error: "Invalid admin password" });
  }
  const filter = req.query.filter || req.body.filter || "all";
  const count = storage.clearByFilter(filter);
  if (filter === "all" || filter === "queued") {
    queue.clearJobs();
  }
  res.json({ ok: true, cleared: count });
});

app.delete("/api/admin/images/:id", (req, res) => {
  const pwd = req.query.password || "";
  if (pwd !== config.adminPassword) {
    return res.status(403).json({ error: "Invalid admin password" });
  }
  const { id } = req.params;
  const ok = storage.deleteRecord(id);
  if (!ok) return res.status(404).json({ error: "Image not found" });
  res.json({ ok: true });
});

app.post("/api/admin/retry/:id", async (req, res) => {
  const pwd = req.query.password || "";
  if (pwd !== config.adminPassword) {
    return res.status(403).json({ error: "Invalid admin password" });
  }
  const { id } = req.params;
  const record = storage.getAllImages().find((r) => r.id === id);
  if (!record) return res.status(404).json({ error: "Image not found" });
  try {
    const result = await queue.enqueue(record.studentName, record.prompt, record.provider || "auto");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/queue/status", (req, res) => {
  const { studentName } = req.query;
  res.json(queue.getQueueSnapshot(studentName || null));
});

app.delete("/api/queue/:id", (req, res) => {
  const admin = adminAuthorized(req);
  if (!admin.ok) return res.status(admin.status).json({ error: admin.error });
  const ok = queue.cancelJob(req.params.id);
  if (!ok) return res.status(400).json({ error: "Job not found or already processing" });
  res.json({ ok: true });
});

app.get("/api/queue/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  res.write("event: connected\ndata: {}\n\n");

  const listenerId = queue.subscribe((event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  });

  req.on("close", () => {
    queue.unsubscribe(listenerId);
  });
});

app.get("/api/config", (req, res) => {
  res.json({
    apiKeyConfigured: !!config.foxcodeApiKey,
    defaultSize: config.defaultSize,
    defaultQuality: config.defaultQuality,
  });
});

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }
  const frontendPath = req.path.includes("admin") ? "admin.html" : req.path.includes("gallery") ? "gallery.html" : "index.html";
  res.sendFile(path.join(__dirname, "public", frontendPath));
});

function start() {
  const server = app.listen(config.port, config.host, () => {
    const { port } = server.address();
    console.log(`Server running at http://${config.host}:${port}`);
    if (!config.foxcodeApiKey) {
      console.warn("WARNING: No API key configured. Set FOXCODE_API_KEY or OPENAI_API_KEY environment variable.");
    }
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${config.port} is already in use. Set PORT to another value and restart.`);
    } else {
      console.error("Server error:", err);
    }
    process.exit(1);
  });
}

start();
