const { v4: uuidv4 } = require("uuid");
const config = require("./config");
const storage = require("./storage");
const { generateAndSave } = require("./imageGenerator");
const moderation = require("./moderation");

const jobs = [];
let processing = false;
let lastCompletionAt = 0;

const listeners = new Map();

function subscribe(listener) {
  const id = uuidv4();
  listeners.set(id, listener);
  return id;
}

function unsubscribe(id) {
  listeners.delete(id);
}

function broadcast(event, data) {
  for (const fn of listeners.values()) {
    try { fn(event, data); } catch (_) {}
  }
}

function getQueueSnapshot(studentName) {
  let queuedPosition = 0;
  const queue = jobs.map((j, i) => {
    const pos = j.status === "queued" ? ++queuedPosition : null;
    return { id: j.id, studentName: j.studentName, prompt: j.prompt, providerPreference: j.providerPreference, status: j.status, position: pos, error: j.error, createdAt: j.createdAt };
  });
  if (studentName) {
    return queue.filter((j) => j.studentName === studentName);
  }
  return queue;
}

function getStudentQueuePosition(studentName) {
  let queued = 0;
  for (const j of jobs) {
    if (j.status === "queued") {
      queued++;
      if (j.studentName === studentName) return queued;
    }
  }
  return 0;
}

function clearJobs() {
  jobs.length = 0;
  broadcast("queue-update", { type: "queue-cleared", queue: [] });
}

function cancelJob(jobId) {
  const idx = jobs.findIndex((j) => j.id === jobId && j.status === "queued");
  if (idx === -1) return false;
  const job = jobs[idx];
  jobs.splice(idx, 1);
  storage.updateRecord(job.id, { status: "cancelled", error: "Cancelled by admin" });
  broadcast("queue-update", { type: "job-cancelled", job: { id: job.id, studentName: job.studentName, status: "cancelled" } });
  return true;
}

async function enqueue(studentName, prompt, providerPreference = "auto") {
  const id = uuidv4();
  const moderationAssessment = moderation.assessPrompt(prompt);
  const job = { id, studentName, prompt, providerPreference, status: "queued", createdAt: new Date().toISOString(), error: null };
  jobs.push(job);

  const record = {
    id,
    studentName,
    prompt,
    imageUrl: null,
    createdAt: job.createdAt,
    completedAt: null,
    status: "queued",
    error: null,
    moderationStatus: moderationAssessment.status,
    moderationReasons: moderationAssessment.reasons,
    moderatedAt: moderationAssessment.flagged ? null : new Date().toISOString(),
    moderatedBy: moderationAssessment.flagged ? null : "filter",
    settings: { model: "gpt-image-2", size: require("./config").defaultSize, quality: require("./config").defaultQuality },
  };
  storage.addRecord(record);

  broadcast("queue-update", { type: "job-queued", job: { id, studentName, prompt, status: "queued", position: getStudentQueuePosition(studentName) } });

  processQueue();
  return { id, position: getStudentQueuePosition(studentName) };
}

async function processQueue() {
  if (processing) return;
  processing = true;

  const waitMs = Math.max(0, config.queueDelayMs - (Date.now() - lastCompletionAt));
  if (lastCompletionAt && waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const pendingIdx = jobs.findIndex((j) => j.status === "queued");
  if (pendingIdx === -1) { processing = false; return; }

  const job = jobs[pendingIdx];
  job.status = "generating";
  storage.updateRecord(job.id, { status: "generating" });
  broadcast("queue-update", { type: "job-started", job: { id: job.id, studentName: job.studentName, status: "generating" } });

  const HARD_TIMEOUT_MS = 240000;
  try {
    const generatePromise = generateAndSave(job.id, job.studentName, job.prompt, job.providerPreference);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Generation timed out after 4 minutes")), HARD_TIMEOUT_MS)
    );
    const { filename, provider } = await Promise.race([generatePromise, timeoutPromise]);
    const imageUrl = `/images/${filename}`;
    storage.updateRecord(job.id, { status: "complete", imageUrl, completedAt: new Date().toISOString(), provider });
    job.status = "complete";
    broadcast("queue-update", { type: "job-complete", job: { id: job.id, studentName: job.studentName, status: "complete", imageUrl, provider } });
  } catch (err) {
    const errMsg = err.message || "Unknown error";
    storage.updateRecord(job.id, { status: "failed", error: errMsg });
    job.status = "failed";
    job.error = errMsg;
    broadcast("queue-update", { type: "job-failed", job: { id: job.id, studentName: job.studentName, status: "failed", error: errMsg } });
  }

  lastCompletionAt = Date.now();
  processing = false;
  broadcast("queue-update", { type: "queue-snapshot", queue: getQueueSnapshot() });
  processQueue();
}

module.exports = { enqueue, getQueueSnapshot, getStudentQueuePosition, subscribe, unsubscribe, clearJobs, cancelJob };
