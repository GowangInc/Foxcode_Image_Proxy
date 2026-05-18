const fs = require("fs");
const path = require("path");
const config = require("./config");

function normalizeRecord(record) {
  if (record.moderationStatus) return record;
  return {
    ...record,
    moderationStatus: record.status === "complete" ? "approved" : "pending",
    moderationReasons: [],
    moderatedAt: null,
    moderatedBy: null,
  };
}

function ensureDataDir() {
  if (!fs.existsSync(config.dataDir)) fs.mkdirSync(config.dataDir, { recursive: true });
  if (!fs.existsSync(config.imagesDir)) fs.mkdirSync(config.imagesDir, { recursive: true });
  if (!fs.existsSync(config.photosBackupDir)) fs.mkdirSync(config.photosBackupDir, { recursive: true });
  if (!fs.existsSync(config.metadataFile)) fs.writeFileSync(config.metadataFile, "[]", "utf-8");
}

function readMetadata() {
  ensureDataDir();
  const raw = fs.readFileSync(config.metadataFile, "utf-8");
  return JSON.parse(raw).map(normalizeRecord);
}

function writeMetadata(records) {
  ensureDataDir();
  fs.writeFileSync(config.metadataFile, JSON.stringify(records, null, 2), "utf-8");
}

function addRecord(record) {
  const records = readMetadata();
  records.push(record);
  writeMetadata(records);
}

function updateRecord(id, updates) {
  const records = readMetadata();
  const idx = records.findIndex((r) => r.id === id);
  if (idx !== -1) {
    records[idx] = { ...records[idx], ...updates };
    writeMetadata(records);
    return records[idx];
  }
  return null;
}

function deleteRecord(id) {
  const records = readMetadata();
  const record = records.find((r) => r.id === id);
  if (!record) return false;
  
  if (record.imageUrl) {
    const filename = path.basename(record.imageUrl);
    const filePath = imagePath(filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  
  const filtered = records.filter((r) => r.id !== id);
  writeMetadata(filtered);
  return true;
}

function clearByFilter(filter) {
  ensureDataDir();
  const records = readMetadata();
  const toDelete = records.filter((r) => {
    if (filter === "all") return true;
    if (filter === "failed") return r.status === "failed";
    if (filter === "complete") return r.status === "complete";
    if (filter === "queued") return r.status === "queued" || r.status === "generating";
    return false;
  });
  
  for (const record of toDelete) {
    if (record.imageUrl) {
      const filePath = imagePath(path.basename(record.imageUrl));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }
  
  const remaining = records.filter((r) => !toDelete.includes(r));
  writeMetadata(remaining);
  return toDelete.length;
}

function getStudentImages(studentName) {
  return readMetadata().filter((r) => r.studentName === studentName);
}

function getAllImages() {
  return readMetadata();
}

function getPublicImages() {
  return readMetadata().filter((r) => r.status === "complete" && r.imageUrl && r.moderationStatus === "approved");
}

function getModerationImages(status = "pending") {
  return readMetadata().filter((r) => status === "all" ? r.moderationStatus !== "approved" : r.moderationStatus === status);
}

function moderateRecord(id, moderationStatus, moderatedBy = "admin", note = "") {
  if (!["approved", "pending", "rejected"].includes(moderationStatus)) return null;
  return updateRecord(id, {
    moderationStatus,
    moderationNote: note,
    moderatedAt: new Date().toISOString(),
    moderatedBy,
  });
}

function imagePath(filename) {
  return path.join(config.imagesDir, filename);
}

function backupPath(filename) {
  return path.join(config.photosBackupDir, filename);
}

function copyToPhotosBackup(filename) {
  ensureDataDir();
  const source = imagePath(filename);
  let target = backupPath(filename);
  if (fs.existsSync(target)) {
    const parsed = path.parse(filename);
    let version = 2;
    while (fs.existsSync(backupPath(`${parsed.name}-v${version}${parsed.ext}`))) {
      version++;
    }
    target = backupPath(`${parsed.name}-v${version}${parsed.ext}`);
  }
  fs.copyFileSync(source, target);
  return target;
}

function clearServerImages() {
  ensureDataDir();
  for (const file of fs.readdirSync(config.imagesDir)) {
    fs.unlinkSync(path.join(config.imagesDir, file));
  }
  writeMetadata([]);
}

function ensureUniqueFilename(studentName, stem, ext) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
  const safeStudent = studentName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
  let filename = `${dateStr}_${timeStr}_${safeStudent}_${stem}${ext}`;
  let counter = 1;
  while (fs.existsSync(imagePath(filename))) {
    filename = `${dateStr}_${timeStr}_${safeStudent}_${stem}-v${counter}${ext}`;
    counter++;
  }
  return filename;
}

module.exports = {
  readMetadata,
  writeMetadata,
  addRecord,
  updateRecord,
  deleteRecord,
  clearByFilter,
  getStudentImages,
  getAllImages,
  getPublicImages,
  getModerationImages,
  moderateRecord,
  imagePath,
  backupPath,
  copyToPhotosBackup,
  clearServerImages,
  ensureUniqueFilename,
};
