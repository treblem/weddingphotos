const input = document.getElementById("mediaInput");
const list = document.getElementById("fileList");
const form = document.getElementById("uploadForm");
const statusEl = document.getElementById("status");
const dropzone = document.getElementById("dropzone");
const grid = document.getElementById("galleryGrid");

// Optional refresh button is added by this script, so no HTML change is required.
let selected = [];
let galleryTimer = null;

input.addEventListener("change", () => {
  selected = [...input.files].filter(isSupportedMedia);
  renderFiles();
});

["dragenter", "dragover"].forEach(e =>
  dropzone.addEventListener(e, ev => {
    ev.preventDefault();
    dropzone.classList.add("drag");
  })
);

["dragleave", "drop"].forEach(e =>
  dropzone.addEventListener(e, ev => {
    ev.preventDefault();
    dropzone.classList.remove("drag");
  })
);

dropzone.addEventListener("drop", ev => {
  selected = [...ev.dataTransfer.files].filter(isSupportedMedia);
  renderFiles();
});

function isSupportedMedia(file) {
  return file.type.startsWith("image/") || file.type.startsWith("video/");
}

function renderFiles() {
  list.innerHTML = selected.map(f =>
    `<div class="file-item"><span>${escapeHtml(f.name)}</span><small>${formatBytes(f.size)}</small></div>`
  ).join("");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0, n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

function supabaseHeaders() {
  return {
    apikey: window.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${window.SUPABASE_ANON_KEY}`
  };
}

function supabaseBase() {
  return window.SUPABASE_URL.replace(/\/$/, "");
}

form.addEventListener("submit", async e => {
  e.preventDefault();

  if (!selected.length) {
    statusEl.textContent = "Please choose at least one photo or video.";
    return;
  }

  const maxMB = 200;
  const tooBig = selected.find(f => f.size > maxMB * 1024 * 1024);
  if (tooBig) {
    statusEl.textContent = `${tooBig.name} is larger than ${maxMB} MB.`;
    return;
  }

  // Demo mode if Supabase has not been configured.
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    selected.forEach(f => addLocalPreview(f));
    statusEl.textContent =
      "Demo upload complete. Configure Supabase in config.js for permanent online storage.";
    form.reset();
    selected = [];
    renderFiles();
    return;
  }

  statusEl.textContent = "Uploading…";

  try {
    const base = supabaseBase();
    const headers = supabaseHeaders();

    for (const file of selected) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${Date.now()}-${crypto.randomUUID()}-${safe}`;

      const uploadUrl =
        `${base}/storage/v1/object/${encodeURIComponent(window.SUPABASE_BUCKET)}/${encodeURIComponent(path)}`;

      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": file.type,
          "x-upsert": "false"
        },
        body: file
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }
    }

    statusEl.textContent = "Thank you! Your memories have been uploaded. ❤️";
    form.reset();
    selected = [];
    renderFiles();

    // Immediately retrieve the new files from Storage.
    await loadGallery();
  } catch (err) {
    console.error(err);
    statusEl.textContent =
      "Upload failed. Please check the Supabase setup and Storage policies.";
  }
});

function addLocalPreview(file) {
  const url = URL.createObjectURL(file);
  const card = document.createElement("div");
  card.className = "media-card";

  card.innerHTML = file.type.startsWith("video/")
    ? `<video src="${url}" controls playsinline preload="metadata"></video><span class="tag">VIDEO • DEMO</span>`
    : `<img src="${url}" alt="Wedding memory"><span class="tag">PHOTO • DEMO</span>`;

  const empty = grid.querySelector(".empty");
  if (empty) empty.remove();
  grid.prepend(card);
}

function clearGallery() {
  grid.innerHTML = "";
}

function showGalleryMessage(message) {
  clearGallery();
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.innerHTML = `<div>♡</div><p>${escapeHtml(message)}</p>`;
  grid.appendChild(empty);
}

function createMediaCard(file) {
  const card = document.createElement("div");
  card.className = "media-card";

  // Supabase Storage returns the path in file.name. Public bucket => public URL.
  const { data } = window.supabasePublicUrl(file.name);
  const url = data.publicUrl;

  if ((file.metadata?.mimetype || "").startsWith("video/")) {
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
    img.onerror = () => {
      card.remove();
      if (!grid.children.length) showGalleryMessage("Some memories could not be displayed.");
    };
    card.appendChild(img);

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = "PHOTO";
    card.appendChild(tag);
  }

  return card;
}

// Minimal public-URL helper. No Supabase JS SDK is required.
window.supabasePublicUrl = function(path) {
  const publicUrl =
    `${supabaseBase()}/storage/v1/object/public/${encodeURIComponent(window.SUPABASE_BUCKET)}/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
  return { data: { publicUrl } };
};

async function loadGallery() {
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    return;
  }

  try {
    const base = supabaseBase();
    const bucket = encodeURIComponent(window.SUPABASE_BUCKET);

    // List the root of wedding-media. The screenshot shows files are stored here.
    const res = await fetch(`${base}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: {
        ...supabaseHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prefix: "",
        limit: 100,
        offset: 0,
        sortBy: { column: "created_at", order: "desc" }
      })
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("Gallery listing failed:", detail);
      showGalleryMessage("Gallery is not available yet. Check the Supabase Storage SELECT policy.");
      return;
    }

    const files = await res.json();

    // Ignore folders and anything that is not a photo/video.
    const media = files.filter(file => {
      const type = file.metadata?.mimetype || "";
      return file.name && (type.startsWith("image/") || type.startsWith("video/"));
    });

    clearGallery();

    if (!media.length) {
      showGalleryMessage("No memories yet.");
      return;
    }

    media.forEach(file => grid.appendChild(createMediaCard(file)));
  } catch (err) {
    console.error("Gallery error:", err);
    showGalleryMessage("Unable to load the gallery. Please try again.");
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

// Automatically check for newly uploaded memories every 15 seconds while the page is open.
if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
  galleryTimer = setInterval(loadGallery, 15000);
}
