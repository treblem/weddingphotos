const input = document.getElementById("mediaInput");
const list = document.getElementById("fileList");
const form = document.getElementById("uploadForm");
const statusEl = document.getElementById("status");
const dropzone = document.getElementById("dropzone");
const grid = document.getElementById("galleryGrid");
const photoGrid = document.getElementById("photoGrid") || grid;
const videoGrid = document.getElementById("videoGrid") || grid;

let selected = [];
let galleryTimer = null;

if (input) {
  input.addEventListener("change", () => {
    selected = [...input.files].filter(isSupportedMedia);
    renderFiles();
  });
}

if (dropzone) {
  ["dragenter", "dragover"].forEach(eventName => {
    dropzone.addEventListener(eventName, ev => {
      ev.preventDefault();
      dropzone.classList.add("drag");
    });
  });

  ["dragleave", "drop"].forEach(eventName => {
    dropzone.addEventListener(eventName, ev => {
      ev.preventDefault();
      dropzone.classList.remove("drag");
    });
  });

  dropzone.addEventListener("drop", ev => {
    selected = [...ev.dataTransfer.files].filter(isSupportedMedia);
    renderFiles();
  });
}

function isSupportedMedia(file) {
  return !!file &&
    ((file.type || "").startsWith("image/") ||
     (file.type || "").startsWith("video/"));
}

function renderFiles() {
  if (!list) return;

  list.innerHTML = selected.map(file =>
    `<div class="file-item"><span>${escapeHtml(file.name)}</span><small>${formatBytes(file.size)}</small></div>`
  ).join("");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;

  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }

  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function supabaseHeaders() {
  return {
    apikey: window.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${window.SUPABASE_ANON_KEY}`
  };
}

function supabaseBase() {
  return String(window.SUPABASE_URL || "").replace(/\/$/, "");
}

function publicStorageUrl(path) {
  const encodedPath = String(path || "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  return `${supabaseBase()}/storage/v1/object/public/${encodeURIComponent(window.SUPABASE_BUCKET)}/${encodedPath}`;
}

function fileKind(file) {
  const mime = String(
    file?.metadata?.mimetype ||
    file?.metadata?.mimeType ||
    file?.mimetype ||
    ""
  ).toLowerCase();

  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "photo";

  const name = String(file?.name || "").toLowerCase();
  if (/\.(mp4|mov|webm|m4v|avi|mkv|3gp|ogv)$/i.test(name)) return "video";
  if (/\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|avif)$/i.test(name)) return "photo";

  return null;
}

if (form) {
  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (!selected.length) {
      if (statusEl) statusEl.textContent = "Please choose at least one photo or video.";
      return;
    }

    const maxMB = 200;
    const tooBig = selected.find(file => file.size > maxMB * 1024 * 1024);

    if (tooBig) {
      if (statusEl) statusEl.textContent = `${tooBig.name} is larger than ${maxMB} MB.`;
      return;
    }

    // Demo mode if Supabase has not been configured.
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !window.SUPABASE_BUCKET) {
      selected.forEach(addLocalPreview);

      if (statusEl) {
        statusEl.textContent =
          "Demo upload complete. Configure Supabase in config.js for permanent online storage.";
      }

      form.reset();
      selected = [];
      renderFiles();
      return;
    }

    if (statusEl) statusEl.textContent = "Uploading…";

    try {
      const base = supabaseBase();
      const headers = supabaseHeaders();
      const bucket = encodeURIComponent(window.SUPABASE_BUCKET);

      for (const file of selected) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const uniqueId = (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const path = `${Date.now()}-${uniqueId}-${safeName}`;

        const uploadUrl =
          `${base}/storage/v1/object/${bucket}/${encodeURIComponent(path)}`;

        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": file.type || "application/octet-stream",
            "x-upsert": "false"
          },
          body: file
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(`Upload failed (${response.status}): ${message}`);
        }
      }

      if (statusEl) {
        statusEl.textContent = "Thank you! Your memories have been uploaded. ❤️";
      }

      form.reset();
      selected = [];
      renderFiles();

      // Give Storage a moment to commit, then refresh.
      await new Promise(resolve => setTimeout(resolve, 300));
      await loadGallery();
    } catch (error) {
      console.error("Upload error:", error);
      if (statusEl) {
        statusEl.textContent =
          "Upload failed. Please check the Supabase setup and Storage policies.";
      }
    }
  });
}

function addLocalPreview(file) {
  const url = URL.createObjectURL(file);
  const card = document.createElement("div");
  card.className = "media-card";

  if (fileKind(file) === "video") {
    card.innerHTML =
      `<video src="${url}" controls playsinline preload="metadata"></video>` +
      `<span class="tag">VIDEO • DEMO</span>`;
  } else {
    card.innerHTML =
      `<img src="${url}" alt="Wedding memory" loading="lazy">` +
      `<span class="tag">PHOTO • DEMO</span>`;
  }

  const target = fileKind(file) === "video" ? videoGrid : photoGrid;
  if (!target) return;

  const empty = target.querySelector(".empty");
  if (empty) empty.remove();

  target.prepend(card);
}

function clearGallery() {
  if (photoGrid && photoGrid !== grid) photoGrid.innerHTML = "";
  if (videoGrid && videoGrid !== grid) videoGrid.innerHTML = "";
  if (photoGrid === grid || videoGrid === grid) {
    if (grid) grid.innerHTML = "";
  }
}

function showEmpty(container, message) {
  if (!container) return;

  const empty = document.createElement("div");
  empty.className = "empty";
  empty.innerHTML = `<div>♡</div><p>${escapeHtml(message)}</p>`;
  container.appendChild(empty);
}

function createMediaCard(file) {
  const card = document.createElement("div");
  card.className = "media-card";

  // IMPORTANT: use the actual Storage object path (file.name).
  // Do not call window.supabasePublicUrl() and do not reference undefined data.publicUrl.
  const url = publicStorageUrl(file.name);
  const kind = fileKind(file);

  if (kind === "video") {
    const video = document.createElement("video");
    video.src = url;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    card.appendChild(video);

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = "VIDEO";
    card.appendChild(tag);
  } else {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "Wedding memory";
    img.loading = "lazy";
    card.appendChild(img);

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = "PHOTO";
    card.appendChild(tag);
  }

  return card;
}

async function listStorageFiles() {
  const base = supabaseBase();
  const bucket = encodeURIComponent(window.SUPABASE_BUCKET);

  const response = await fetch(`${base}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prefix: "",
      limit: 1000,
      offset: 0,
      sortBy: { column: "created_at", order: "desc" }
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Gallery listing failed (${response.status}): ${message}`);
  }

  const files = await response.json();
  return Array.isArray(files) ? files : [];
}

async function loadGallery() {
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !window.SUPABASE_BUCKET) {
    return;
  }

  try {
    const files = await listStorageFiles();

    const media = files.filter(file => {
      return file && file.name && fileKind(file);
    });

    showGallerySections(media);
  } catch (error) {
    console.error("Gallery error:", error);
    showGallerySections([]);
  }
}

function showGallerySections(media) {
  if (!photoGrid || !videoGrid) return;

  // Single-grid fallback for the original HTML.
  if (photoGrid === grid || videoGrid === grid) {
    if (grid) grid.innerHTML = "";

    if (!media.length) {
      showEmpty(grid, "No memories yet.");
      return;
    }

    media.forEach(file => grid.appendChild(createMediaCard(file)));
    return;
  }

  photoGrid.innerHTML = "";
  videoGrid.innerHTML = "";

  const photos = media.filter(file => fileKind(file) === "photo");
  const videos = media.filter(file => fileKind(file) === "video");

  if (!photos.length) {
    showEmpty(photoGrid, "No photos yet.");
  } else {
    photos.forEach(file => photoGrid.appendChild(createMediaCard(file)));
  }

  if (!videos.length) {
    showEmpty(videoGrid, "No videos yet.");
  } else {
    videos.forEach(file => videoGrid.appendChild(createMediaCard(file)));
  }
}

function addRefreshButton() {
  const title = document.querySelector("#gallery .section-title");

  if (!title || document.getElementById("refreshGallery")) return;

  const button = document.createElement("button");
  button.id = "refreshGallery";
  button.type = "button";
  button.className = "btn ghost";
  button.textContent = "↻ Refresh Gallery";
  button.style.marginLeft = "auto";

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Refreshing…";

    await loadGallery();

    button.disabled = false;
    button.textContent = "↻ Refresh Gallery";
  });

  title.appendChild(button);
}

addRefreshButton();
loadGallery();

// Automatically check for newly uploaded memories every 15 seconds.
if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.SUPABASE_BUCKET) {
  galleryTimer = setInterval(loadGallery, 15000);
}
