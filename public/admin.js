let adminPassword = "";
let adminToken = localStorage.getItem("adminToken") || "";
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function providerLabel(provider) {
  if (!provider) return "";
  if (provider.toLowerCase() === "foxcode") return "OpenAI via Foxcode";
  if (provider.toLowerCase() === "gemini") return "Gemini via Foxcode";
  return provider;
}

function studentActionButton(label, className, onClick) {
  const btn = document.createElement("button");
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function renderStudentList(listEl, items, renderItem) {
  if (!items.length) {
    listEl.innerHTML = '<p class="gallery-empty">None</p>';
    return;
  }
  listEl.innerHTML = "";
  items.forEach((item, index) => listEl.appendChild(renderItem(item, index + 1)));
}

function createStudentRow(studentName, metaText, actions, number) {
  const row = document.createElement("div");
  row.className = "student-item";
  const left = document.createElement("div");
  left.className = "student-item-copy";
  const title = document.createElement("strong");
  title.textContent = number ? `${number}. ${studentName}` : studentName;
  const meta = document.createElement("span");
  meta.textContent = metaText || "";
  left.appendChild(title);
  if (metaText) left.appendChild(meta);
  row.appendChild(left);
  const actionsWrap = document.createElement("div");
  actionsWrap.className = "student-item-actions";
  actions.forEach((btn) => actionsWrap.appendChild(btn));
  row.appendChild(actionsWrap);
  return row;
}

async function loadStudentManagement() {
  if (!adminPassword) return;
  try {
    const res = await fetch(`/api/admin/students?${adminQuery()}`);
    if (!res.ok) return;
    const data = await res.json();
    renderStudentList($("#approved-students-list"), data.approved || [], (student, number) =>
      createStudentRow(
        student.studentName,
        `Approved ${timeAgo(student.approvedAt)}`,
        [
          studentActionButton("Kick", "btn-delete btn-small", () => kickStudent(student.studentName)),
          studentActionButton("Block", "btn-danger btn-small", () => blockStudent(student.studentName)),
        ],
        number
      )
    );
    renderStudentList($("#active-students-list"), data.active || [], (student, number) =>
      createStudentRow(
        student.studentName,
        "Currently active",
        [
          studentActionButton("Kick", "btn-delete btn-small", () => kickStudent(student.studentName)),
          studentActionButton("Block", "btn-danger btn-small", () => blockStudent(student.studentName)),
        ],
        number
      )
    );
    renderStudentList($("#pending-students-list"), data.pending || [], (student, number) =>
      createStudentRow(
        student.studentName,
        `Requested ${timeAgo(student.requestTime)}`,
        [
          studentActionButton("Approve", "btn-retry btn-small", () => approveStudent(student.id)),
          studentActionButton("Deny", "btn-delete btn-small", () => denyStudent(student.id)),
        ],
        number
      )
    );
    renderStudentList($("#blocked-students-list"), data.blocked || [], (student, number) =>
      createStudentRow(
        student.studentName,
        "Blocked",
        [studentActionButton("Unblock", "btn-small", () => unblockStudent(student.studentName))],
        number
      )
    );
  } catch (e) {
    console.error("Failed to load student management:", e);
  }
}

function adminQuery(extra = "") {
  const params = new URLSearchParams({ password: adminPassword });
  if (adminToken) params.set("adminToken", adminToken);
  if (extra) {
    const extraParams = new URLSearchParams(extra.startsWith("?") ? extra.slice(1) : extra);
    for (const [key, value] of extraParams) params.set(key, value);
  }
  return params.toString();
}

async function adminLogin() {
  const enrollmentCode = $("#admin-enrollment-code-input")?.value.trim() || "";
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: adminPassword, adminToken, enrollmentCode, label: navigator.userAgent.slice(0, 80) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Admin login failed");
  if (data.adminToken) {
    adminToken = data.adminToken;
    localStorage.setItem("adminToken", adminToken);
  }
  return data;
}

function showScreen(name) {
  $$(".screen").forEach((s) => s.classList.remove("active"));
  const target = $(`#${name}-screen`);
  if (target) target.classList.add("active");
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs === 1) return "1 hour ago";
  if (hrs < 24) return `${hrs} hours ago`;
  return new Date(iso).toLocaleDateString();
}

function openLightbox(src) {
  $("#lightbox-img").src = src;
  $("#lightbox").classList.remove("hidden");
}

function closeLightbox() {
  $("#lightbox").classList.add("hidden");
  $("#lightbox-img").src = "";
}

function renderAdminGallery(images) {
  const gallery = $("#admin-gallery");
  const empty = $("#admin-gallery-empty");
  gallery.innerHTML = "";
  gallery.appendChild(empty);

  const sorted = [...images].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (sorted.length === 0) {
    empty.classList.remove("hidden");
    $("#admin-count-label").textContent = "0 images";
    return;
  }
  empty.classList.add("hidden");
  $("#admin-count-label").textContent = `${sorted.length} image${sorted.length !== 1 ? "s" : ""}`;

  sorted.forEach((img) => {
    const item = document.createElement("div");
    item.className = "gallery-item";
    item.dataset.id = img.id;

    if (img.status === "complete" && img.imageUrl) {
      const el = document.createElement("img");
      el.src = img.imageUrl;
      el.alt = img.prompt;
      el.loading = "lazy";
      el.addEventListener("click", () => openLightbox(img.imageUrl));
      item.appendChild(el);
    } else if (img.status === "queued" || img.status === "generating") {
      const placeholder = document.createElement("div");
      placeholder.style.cssText = "aspect-ratio:1;display:flex;align-items:center;justify-content:center;background:var(--bg);";
      placeholder.innerHTML = '<div class="queue-spinner"></div>';
      item.appendChild(placeholder);
    }

    const meta = document.createElement("div");
    meta.className = "gallery-item-meta";

    const student = document.createElement("div");
    student.className = "gallery-item-student";
    student.textContent = img.studentName;
    meta.appendChild(student);

    if (img.status !== "complete") {
      const status = document.createElement("span");
      status.className = `gallery-item-status status-${img.status}`;
      status.textContent = img.status;
      meta.appendChild(status);
    }

    if (img.provider) {
      const provider = document.createElement("span");
      provider.className = "gallery-item-provider";
      provider.textContent = providerLabel(img.provider);
      meta.appendChild(provider);
    }

    if (img.moderationStatus) {
      const moderation = document.createElement("span");
      moderation.className = `gallery-item-status moderation-${img.moderationStatus}`;
      moderation.textContent = img.moderationStatus === "approved" ? "public" : img.moderationStatus;
      meta.appendChild(moderation);
    }

    const prompt = document.createElement("div");
    prompt.className = "gallery-item-prompt";
    prompt.textContent = img.prompt;
    meta.appendChild(prompt);

    const time = document.createElement("div");
    time.className = "gallery-item-time";
    time.textContent = timeAgo(img.createdAt);
    meta.appendChild(time);

    const actions = document.createElement("div");
    actions.className = "gallery-item-actions";

    if (img.status === "complete" && img.imageUrl) {
      const download = document.createElement("a");
      download.className = "gallery-download";
      download.href = img.imageUrl;
      download.download = "";
      download.textContent = "Download";
      actions.appendChild(download);

      if (img.moderationStatus !== "approved") {
        const approveBtn = document.createElement("button");
        approveBtn.className = "btn-retry";
        approveBtn.textContent = "Approve Public";
        approveBtn.addEventListener("click", () => moderateImage(img.id, "approved"));
        actions.appendChild(approveBtn);
      }

      if (img.moderationStatus !== "rejected") {
        const rejectBtn = document.createElement("button");
        rejectBtn.className = "btn-delete";
        rejectBtn.textContent = "Hide Public";
        rejectBtn.addEventListener("click", () => moderateImage(img.id, "rejected"));
        actions.appendChild(rejectBtn);
      }
    }

    if (img.status === "failed") {
      const retryBtn = document.createElement("button");
      retryBtn.className = "btn-retry";
      retryBtn.textContent = "Retry";
      retryBtn.addEventListener("click", () => retryImageFromAdmin(img.id));
      actions.appendChild(retryBtn);
    }

    const delBtn = document.createElement("button");
    delBtn.className = "btn-delete";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => deleteImage(img.id));
    actions.appendChild(delBtn);

    meta.appendChild(actions);

    if (img.error) {
      const err = document.createElement("div");
      err.className = "gallery-item-error";
      err.textContent = img.error;
      meta.appendChild(err);
    }

    item.appendChild(meta);
    gallery.insertBefore(item, empty);
  });
}

function renderModerationList(images) {
  const list = $("#moderation-list");
  if (!images.length) {
    list.innerHTML = '<p class="gallery-empty">No images need review.</p>';
    return;
  }

  list.innerHTML = "";
  images.forEach((img) => {
    const item = document.createElement("div");
    item.className = "moderation-item";

    const thumb = document.createElement("div");
    thumb.className = "moderation-thumb";
    if (img.imageUrl) {
      const image = document.createElement("img");
      image.src = img.imageUrl;
      image.alt = img.prompt;
      image.addEventListener("click", () => openLightbox(img.imageUrl));
      thumb.appendChild(image);
    } else {
      thumb.textContent = img.status;
    }
    item.appendChild(thumb);

    const copy = document.createElement("div");
    copy.className = "moderation-copy";
    const title = document.createElement("strong");
    title.textContent = `${img.studentName} · ${img.moderationStatus}`;
    const prompt = document.createElement("p");
    prompt.className = "gallery-item-prompt";
    prompt.textContent = img.prompt;
    const reason = document.createElement("p");
    reason.className = "gallery-item-error";
    reason.textContent = (img.moderationReasons || []).join("; ") || "Manually held for review";
    copy.appendChild(title);
    copy.appendChild(prompt);
    copy.appendChild(reason);
    item.appendChild(copy);

    const actions = document.createElement("div");
    actions.className = "moderation-actions";
    const approve = document.createElement("button");
    approve.className = "btn-retry btn-small";
    approve.textContent = "Approve";
    approve.addEventListener("click", () => moderateImage(img.id, "approved"));
    const reject = document.createElement("button");
    reject.className = "btn-delete btn-small";
    reject.textContent = "Reject";
    reject.addEventListener("click", () => moderateImage(img.id, "rejected"));
    actions.appendChild(approve);
    actions.appendChild(reject);
    item.appendChild(actions);

    list.appendChild(item);
  });
}

async function loadModeration() {
  if (!adminPassword) return;
  try {
    const status = $("#moderation-filter").value;
    const res = await fetch(`/api/admin/moderation?${adminQuery(`status=${encodeURIComponent(status)}`)}`);
    if (!res.ok) return;
    renderModerationList(await res.json());
  } catch (e) {
    console.error("Failed to load moderation queue:", e);
  }
}

async function moderateImage(id, status) {
  if (!adminPassword) return;
  try {
    const res = await fetch(`/api/admin/moderate/${id}?${adminQuery()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Moderation failed" }));
      throw new Error(err.error || "Moderation failed");
    }
    loadAdminGallery();
    loadModeration();
  } catch (e) {
    alert(`Could not update moderation status: ${e.message}`);
  }
}

async function loadModerationFilters() {
  if (!adminPassword) return;
  try {
    const res = await fetch(`/api/admin/moderation-filters?${adminQuery()}`);
    if (!res.ok) return;
    const filters = await res.json();
    $("#blocked-terms-input").value = (filters.blockedTerms || []).join("\n");
    $("#blocked-patterns-input").value = (filters.blockedPatterns || []).join("\n");
  } catch (e) {
    console.error("Failed to load moderation filters:", e);
  }
}

async function saveModerationFilters() {
  if (!adminPassword) return;
  const body = {
    blockedTerms: $("#blocked-terms-input").value.split("\n"),
    blockedPatterns: $("#blocked-patterns-input").value.split("\n"),
  };
  try {
    const res = await fetch(`/api/admin/moderation-filters?${adminQuery()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Save failed");
    alert("Filters saved. They apply to newly queued prompts.");
  } catch (e) {
    alert("Could not save filters.");
  }
}

function renderAdminTokens(tokens) {
  const list = $("#admin-token-list");
  if (!tokens.length) {
    list.innerHTML = '<p class="gallery-empty">No trusted browsers enrolled.</p>';
    return;
  }
  list.innerHTML = "";
  tokens.forEach((token) => {
    const item = document.createElement("div");
    item.className = "token-item";
    item.innerHTML = `
      <strong></strong>
      <span></span>
    `;
    item.querySelector("strong").textContent = token.label || "Admin browser";
    item.querySelector("span").textContent = `ID ...${token.tokenSuffix} · last used ${timeAgo(token.lastUsedAt)}`;
    list.appendChild(item);
  });
}

async function loadAdminTokens() {
  if (!adminPassword) return;
  try {
    const res = await fetch(`/api/admin/tokens?${adminQuery()}`);
    if (!res.ok) return;
    renderAdminTokens(await res.json());
  } catch (e) {
    console.error("Failed to load admin tokens:", e);
  }
}

async function clearAdminTokens() {
  if (!adminPassword) return;
  if (!confirm("Clear all trusted admin browsers? You will need to re-enroll this browser with the admin password.")) return;
  try {
    const res = await fetch(`/api/admin/tokens/clear?${adminQuery()}`, { method: "POST" });
    if (!res.ok) throw new Error("Clear failed");
    adminToken = "";
    localStorage.removeItem("adminToken");
    alert("Trusted browsers cleared. Log in again to trust this browser.");
    showScreen("admin-login");
  } catch (e) {
    alert("Could not clear trusted browsers.");
  }
}

async function generateAdminEnrollmentCode() {
  if (!adminPassword) return;
  try {
    const res = await fetch(`/api/admin/enrollment-code?${adminQuery()}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not generate code");
    const box = $("#admin-enrollment-code");
    box.innerHTML = `Add-browser code: <strong>${data.code}</strong><span>Expires ${new Date(data.expiresAt).toLocaleTimeString()}</span>`;
    box.classList.remove("hidden");
  } catch (e) {
    alert(`Could not generate add-browser code: ${e.message}`);
  }
}

async function approveStudent(requestId) {
  if (!adminPassword) return;
  const res = await fetch(`/api/admin/approve/${requestId}?${adminQuery()}`, { method: "POST" });
  if (!res.ok) return alert("Could not approve student.");
  loadStudentManagement();
}

async function denyStudent(requestId) {
  if (!adminPassword) return;
  const res = await fetch(`/api/admin/deny/${requestId}?${adminQuery()}`, { method: "POST" });
  if (!res.ok) return alert("Could not deny student.");
  loadStudentManagement();
}

async function kickStudent(studentName) {
  if (!adminPassword) return;
  if (!confirm(`Kick ${studentName}? This removes approved access and blocks them.`)) return;
  const res = await fetch(`/api/admin/kick?${adminQuery()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentName }),
  });
  if (!res.ok) return alert("Could not kick student.");
  loadStudentManagement();
  loadAdminTokens();
}

async function unblockStudent(studentName) {
  if (!adminPassword) return;
  const res = await fetch(`/api/admin/blocklist/${encodeURIComponent(studentName)}?${adminQuery()}`, { method: "DELETE" });
  if (!res.ok) return alert("Could not unblock student.");
  loadStudentManagement();
}

async function blockStudent(studentName) {
  if (!adminPassword) return;
  if (!confirm(`Block ${studentName}?`)) return;
  const res = await fetch(`/api/admin/kick?${adminQuery()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentName }),
  });
  if (!res.ok) return alert("Could not block student.");
  loadStudentManagement();
  loadAdminTokens();
}

async function loadAdminGallery() {
  if (!adminPassword) return;
  try {
    const res = await fetch(`/api/admin/images?${adminQuery()}`);
    if (res.status === 403) {
      showScreen("admin-login");
      $("#admin-login-error").textContent = "Invalid password";
      $("#admin-login-error").classList.remove("hidden");
      return;
    }
    const images = await res.json();
    applyFilters(images);
    populateStudentFilter(images);
  } catch (e) {
    console.error("Failed to load admin gallery:", e);
  }
}

function applyFilters(allImages) {
  const search = $("#filter-input").value.toLowerCase();
  const status = $("#status-filter").value;
  const student = $("#student-filter").value;

  let filtered = allImages;
  if (search) {
    filtered = filtered.filter((img) =>
      img.studentName.toLowerCase().includes(search) ||
      img.prompt.toLowerCase().includes(search)
    );
  }
  if (status !== "all") {
    filtered = filtered.filter((img) => img.status === status);
  }
  if (student !== "all") {
    filtered = filtered.filter((img) => img.studentName === student);
  }
  renderAdminGallery(filtered);
}

function populateStudentFilter(images) {
  const select = $("#student-filter");
  const current = select.value;
  const names = [...new Set(images.map((img) => img.studentName))].sort();
  select.innerHTML = '<option value="all">All students</option>';
  names.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  if (current) select.value = current;
}

async function deleteImage(id) {
  if (!adminPassword) return;
  if (!confirm("Delete this image from the gallery?")) return;
  try {
    const res = await fetch(`/api/admin/images/${id}?${adminQuery()}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed");
    loadAdminGallery();
    loadAdminQueue();
  } catch (e) {
    alert("Could not delete image.");
  }
}

async function retryImageFromAdmin(id) {
  if (!adminPassword) return;
  if (!confirm("Retry this failed image? It will be re-queued for generation.")) return;
  try {
    const res = await fetch(`/api/admin/retry/${id}?${adminQuery()}`, { method: "POST" });
    if (!res.ok) throw new Error("Retry failed");
    loadAdminGallery();
    loadAdminQueue();
  } catch (e) {
    alert("Could not retry image.");
  }
}

async function clearImages(filter) {
  if (!adminPassword) return;
  const label = filter === "all" ? "all" : filter;
  if (!confirm(`Clear ${label} images from the gallery?`)) return;
  try {
    const res = await fetch(`/api/admin/images?${adminQuery(`filter=${encodeURIComponent(filter)}`)}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Clear failed");
    loadAdminGallery();
    loadAdminQueue();
  } catch (e) {
    alert("Could not clear images.");
  }
}

function renderAdminQueue(queue) {
  const list = $("#admin-queue-list");
  const active = queue.filter((j) => j.status === "queued" || j.status === "generating");

  if (active.length === 0) {
    list.innerHTML = '<p class="gallery-empty">No active jobs.</p>';
    return;
  }
  list.innerHTML = "";

  active.forEach((job) => {
    const item = document.createElement("div");
    item.className = "queue-item";

    const pos = document.createElement("span");
    pos.className = "queue-item-position";
    pos.textContent = job.position || "•";
    item.appendChild(pos);

    const student = document.createElement("span");
    student.style.cssText = "font-weight:500;min-width:80px;";
    student.textContent = job.studentName;
    item.appendChild(student);

    const prompt = document.createElement("span");
    prompt.className = "queue-item-prompt admin-queue-prompt";
    prompt.textContent = job.prompt;
    item.appendChild(prompt);

    const status = document.createElement("span");
    status.className = `queue-item-status status-${job.status}`;
    status.textContent = job.status;
    item.appendChild(status);

    if (job.providerPreference) {
      const provider = document.createElement("span");
      provider.className = "queue-item-status";
      provider.textContent = job.providerPreference;
      item.appendChild(provider);
    }

    if (job.status === "queued") {
      const cancel = document.createElement("button");
      cancel.className = "btn-delete btn-small";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => cancelQueueJob(job.id));
      item.appendChild(cancel);
    }

    list.appendChild(item);
  });
}

async function loadAdminQueue() {
  if (!adminPassword) return;
  try {
    const res = await fetch("/api/queue/status");
    const queue = await res.json();
    renderAdminQueue(queue);
  } catch (e) {
    console.error("Failed to load admin queue:", e);
  }
}

async function cancelQueueJob(id) {
  if (!adminPassword) return;
  if (!confirm("Cancel this queued job?")) return;
  try {
    const res = await fetch(`/api/queue/${id}?${adminQuery()}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Cancel failed");
    loadAdminQueue();
    loadAdminGallery();
  } catch (e) {
    alert("Could not cancel job.");
  }
}

function initAdmin() {
  $("#admin-login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    adminPassword = $("#admin-password-input").value.trim();
    if (!adminPassword) return;
    try {
      await adminLogin();
      await loadAdminGallery();
      await loadAdminQueue();
      await loadStudentManagement();
      await loadModeration();
      await loadModerationFilters();
      await loadAdminTokens();
      if ($("#admin-gallery-screen").classList.contains("active")) return;
      showScreen("admin-gallery");
    } catch (err) {
      $("#admin-login-error").textContent = err.message;
      $("#admin-login-error").classList.remove("hidden");
    }
  });

  $("#admin-logout-btn").addEventListener("click", () => {
    adminPassword = "";
    $("#admin-password-input").value = "";
    $("#admin-enrollment-code-input").value = "";
    showScreen("admin-login");
  });

  $("#filter-input").addEventListener("input", () => loadAdminGallery());
  $("#status-filter").addEventListener("change", () => loadAdminGallery());
  $("#student-filter").addEventListener("change", () => loadAdminGallery());
  $("#moderation-filter").addEventListener("change", () => loadModeration());
  $("#save-filters-btn").addEventListener("click", saveModerationFilters);
  $("#generate-admin-code-btn").addEventListener("click", generateAdminEnrollmentCode);
  $("#clear-admin-tokens-btn").addEventListener("click", clearAdminTokens);
  $("#refresh-students-btn").addEventListener("click", loadStudentManagement);

  $("#clear-all-btn").addEventListener("click", () => clearImages("all"));
  $("#clear-failed-btn").addEventListener("click", () => clearImages("failed"));
  $("#clear-completed-btn").addEventListener("click", () => clearImages("complete"));
  $("#clear-queued-btn").addEventListener("click", () => clearImages("queued"));

  $("#lightbox-backdrop")?.addEventListener("click", closeLightbox);
  $("#lightbox-close")?.addEventListener("click", closeLightbox);

  const adminEventSource = new EventSource("/api/queue/events");
  adminEventSource.addEventListener("queue-update", (e) => {
    const data = JSON.parse(e.data);
    if (data.type === "job-queued" || data.type === "job-started" || data.type === "job-complete" || data.type === "job-failed" || data.type === "job-cancelled" || data.type === "queue-cleared" || data.type === "queue-snapshot") {
      loadAdminGallery();
      loadAdminQueue();
      loadStudentManagement();
      loadModeration();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAdmin);
} else {
  initAdmin();
}
