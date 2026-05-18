let allImages = [];
const $ = (sel) => document.querySelector(sel);

function providerLabel(provider) {
  if (!provider) return "";
  if (provider.toLowerCase() === "foxcode") return "OpenAI via Foxcode";
  if (provider.toLowerCase() === "gemini") return "Gemini via Foxcode";
  return provider;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
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

function populateStudents(images) {
  const select = $("#public-student-filter");
  const current = select.value;
  const names = [...new Set(images.map((img) => img.studentName))].sort();
  select.innerHTML = '<option value="all">All students</option>';
  names.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  select.value = names.includes(current) ? current : "all";
}

function renderGallery(images) {
  const gallery = $("#public-gallery");
  const empty = $("#public-gallery-empty");
  gallery.innerHTML = "";
  gallery.appendChild(empty);

  const sorted = [...images].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (sorted.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  sorted.forEach((img) => {
    const item = document.createElement("article");
    item.className = "gallery-item public-gallery-item";

    const image = document.createElement("img");
    image.src = img.imageUrl;
    image.alt = img.prompt;
    image.loading = "lazy";
    image.addEventListener("click", () => openLightbox(img.imageUrl));
    item.appendChild(image);

    const meta = document.createElement("div");
    meta.className = "gallery-item-meta";

    const student = document.createElement("div");
    student.className = "gallery-item-student";
    student.textContent = img.studentName;
    meta.appendChild(student);

    const prompt = document.createElement("div");
    prompt.className = "gallery-item-prompt";
    prompt.textContent = img.prompt;
    meta.appendChild(prompt);

    const time = document.createElement("div");
    time.className = "gallery-item-time";
    time.textContent = [timeAgo(img.createdAt), providerLabel(img.provider)].filter(Boolean).join(" · ");
    meta.appendChild(time);

    item.appendChild(meta);
    gallery.insertBefore(item, empty);
  });
}

function applyFilters() {
  const search = $("#public-filter-input").value.toLowerCase();
  const student = $("#public-student-filter").value;
  let filtered = allImages;
  if (search) {
    filtered = filtered.filter((img) =>
      img.studentName.toLowerCase().includes(search) || img.prompt.toLowerCase().includes(search)
    );
  }
  if (student !== "all") filtered = filtered.filter((img) => img.studentName === student);
  renderGallery(filtered);
}

async function loadGallery() {
  const res = await fetch("/api/public/gallery");
  allImages = await res.json();
  populateStudents(allImages);
  applyFilters();
}

function init() {
  $("#public-filter-input").addEventListener("input", applyFilters);
  $("#public-student-filter").addEventListener("change", applyFilters);
  $("#refresh-gallery-btn").addEventListener("click", loadGallery);
  $(".lightbox-backdrop")?.addEventListener("click", closeLightbox);
  $("#lightbox-close")?.addEventListener("click", closeLightbox);
  loadGallery().catch(() => {
    $("#public-gallery-empty").textContent = "Could not load the gallery.";
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
