let studentName = "";
let eventSource = null;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function providerLabel(provider) {
  if (!provider) return "";
  if (provider.toLowerCase() === "foxcode") return "OpenAI via Foxcode";
  if (provider.toLowerCase() === "gemini") return "Gemini via Foxcode";
  return provider;
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

function renderGallery(images) {
  const gallery = $("#gallery");
  const empty = $("#gallery-empty");
  gallery.innerHTML = "";
  gallery.appendChild(empty);

  const sorted = [...images].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (sorted.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

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

    if (img.status === "complete" && img.moderationStatus) {
      const moderation = document.createElement("span");
      moderation.className = `gallery-item-status moderation-${img.moderationStatus}`;
      moderation.textContent = img.moderationStatus === "approved" ? "public" : img.moderationStatus === "pending" ? "teacher review" : "not public";
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
    }

    if (img.status === "failed") {
      const retry = document.createElement("button");
      retry.className = "btn-retry";
      retry.textContent = "Retry";
      retry.addEventListener("click", () => retryImage(img.prompt));
      actions.appendChild(retry);
    }

    if (actions.children.length > 0) {
      meta.appendChild(actions);
    }

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

async function loadGallery() {
  if (!studentName) return;
  try {
    const res = await fetch(`/api/images?studentName=${encodeURIComponent(studentName)}`);
    const images = await res.json();
    renderGallery(images);
  } catch (e) {
    console.error("Failed to load gallery:", e);
  }
}

async function retryImage(prompt) {
  if (!studentName || !prompt) return;
  $("#generate-btn").disabled = true;
  showQueueStatus("Retrying...");
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentName, prompt }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(err.error);
    }
    await loadGallery();
  } catch (err) {
    hideQueueStatus();
    showError(err.message || "Failed to retry");
    $("#generate-btn").disabled = false;
  }
}

function renderQueueList(queue) {
  const list = $("#queue-list");
  const section = $("#queue-section");
  const active = queue.filter((j) => j.status === "queued" || j.status === "generating");

  if (active.length === 0) {
    section.classList.add("hidden");
    return;
  }
  section.classList.remove("hidden");
  list.innerHTML = "";

  active.forEach((job) => {
    const item = document.createElement("div");
    item.className = "queue-item";

    const pos = document.createElement("span");
    pos.className = "queue-item-position";
    pos.textContent = job.position || "•";
    item.appendChild(pos);

    const prompt = document.createElement("span");
    prompt.className = "queue-item-prompt";
    prompt.textContent = job.prompt;
    item.appendChild(prompt);

    const status = document.createElement("span");
    status.className = `queue-item-status status-${job.status}`;
    status.textContent = job.status;
    item.appendChild(status);

    list.appendChild(item);
  });
}

async function loadQueue() {
  if (!studentName) return;
  try {
    const res = await fetch(`/api/queue/status?studentName=${encodeURIComponent(studentName)}`);
    const queue = await res.json();
    renderQueueList(queue);
  } catch (e) {
    console.error("Failed to load queue:", e);
  }
}

function updateGalleryItem(job) {
  const item = $(`.gallery-item[data-id="${job.id}"]`);
  if (!item) return loadGallery();

  const meta = item.querySelector(".gallery-item-meta");
  if (!meta) return;

  if (job.status === "complete" && job.imageUrl) {
    const img = document.createElement("img");
    img.src = job.imageUrl;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("click", () => openLightbox(job.imageUrl));
    item.querySelector(".queue-spinner")?.parentElement?.remove();
    item.querySelector("img")?.remove();
    item.insertBefore(img, meta);
  }

  meta.querySelector(".gallery-item-status")?.remove();
  if (job.status !== "complete") {
    const status = document.createElement("span");
    status.className = `gallery-item-status status-${job.status}`;
    status.textContent = job.status;
    meta.insertBefore(status, meta.firstChild);
  }

  const actions = meta.querySelector(".gallery-item-actions");
  if (actions) {
    actions.querySelector(".btn-retry")?.remove();
    if (job.status === "failed") {
      const retry = document.createElement("button");
      retry.className = "btn-retry";
      retry.textContent = "Retry";
      retry.addEventListener("click", () => retryImage(job.prompt));
      actions.appendChild(retry);
    }
  }

  meta.querySelector(".gallery-item-error")?.remove();
  if (job.error) {
    const err = document.createElement("div");
    err.className = "gallery-item-error";
    err.textContent = job.error;
    meta.appendChild(err);
  }
}

async function checkApiConfig() {
  try {
    const res = await fetch("/api/config");
    const cfg = await res.json();
    if (!cfg.apiKeyConfigured) {
      $("#api-warning").classList.remove("hidden");
    }
  } catch (_) {}
}

function connectEventSource() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource("/api/queue/events");
  eventSource.addEventListener("queue-update", (e) => {
    const data = JSON.parse(e.data);
    if (data.job?.studentName !== studentName) return;

    if (data.type === "job-complete" || data.type === "job-failed") {
      updateGalleryItem(data.job);
      hideQueueStatus();
      loadQueue();
    }
    if (data.type === "job-queued") {
      showQueueStatus(`Queued — position ${data.job.position}`);
      loadQueue();
    }
    if (data.type === "job-started") {
      showQueueStatus("Generating your image...");
      loadQueue();
    }
    if (data.type === "queue-cleared") {
      loadQueue();
    }
  });
  eventSource.addEventListener("error", (e) => {
    console.warn("SSE connection error:", e);
  });
}

function showQueueStatus(msg) {
  const el = $("#queue-status");
  $("#queue-message").textContent = msg;
  el.classList.remove("hidden");
}

function hideQueueStatus() {
  $("#queue-status").classList.add("hidden");
  $("#generate-btn").disabled = false;
}

function showError(msg) {
  $("#error-message").textContent = msg;
  $("#error-message").classList.remove("hidden");
}

function hideError() {
  $("#error-message").classList.add("hidden");
}

function enterMain(name) {
  studentName = name;
  localStorage.setItem("studentName", name);
  $("#student-label").textContent = studentName;
  showScreen("main");
  loadGallery();
  loadQueue();
  checkApiConfig();
  connectEventSource();
}

function initApp() {
  const signinForm = $("#signin-form");
  if (!signinForm) {
    console.error("Signin form not found!");
    return;
  }

  signinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();
    const name = $("#name-input").value.trim();
    if (!name) {
      showError("Please enter your name");
      return;
    }
    enterMain(name);
    try {
      const res = await fetch("/api/signin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Server error" }));
        throw new Error(err.error || "Sign in failed");
      }
    } catch (err) {
      console.error("Sign in error:", err);
      showError(err.message || "Signed in locally, but server sync failed.");
    }
  });

  $("#logout-btn").addEventListener("click", () => {
    studentName = "";
    localStorage.removeItem("studentName");
    $("#name-input").value = "";
    if (eventSource) eventSource.close();
    showScreen("signin");
  });

  $("#prompt-input").addEventListener("input", () => {
    const len = $("#prompt-input").value.length;
    $("#char-count").textContent = `${len} / 1000`;
    $("#generate-btn").disabled = len === 0;
  });

  $("#prompt-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();
    const prompt = $("#prompt-input").value.trim();
    const provider = $("#provider-select").value;
    if (!prompt || !studentName) return;

    $("#generate-btn").disabled = true;
    showQueueStatus("Queued...");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentName, prompt, provider }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error);
      }
      await loadGallery();
      await loadQueue();
      $("#prompt-input").value = "";
      $("#char-count").textContent = "0 / 1000";
    } catch (err) {
      hideQueueStatus();
      showError(err.message || "Failed to generate image");
      $("#generate-btn").disabled = false;
    }
  });

  $("#lightbox-backdrop")?.addEventListener("click", closeLightbox);
  $("#lightbox-close")?.addEventListener("click", closeLightbox);

  const savedName = localStorage.getItem("studentName");
  if (savedName) {
    $("#name-input").value = savedName;
    enterMain(savedName);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
