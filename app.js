document.addEventListener('DOMContentLoaded', () => {
  // Supabase Configuration
  const SUPABASE_URL = (window.SUPABASE_URL || '').replace(/\/$/, '');
  const SUPABASE_KEY = window.SUPABASE_ANON_KEY || '';
  const BUCKET = window.SUPABASE_BUCKET || 'wedding-media';

  // DOM Elements
  const dropzone = document.getElementById('dropzone');
  const mediaInput = document.getElementById('mediaInput');
  const fileList = document.getElementById('fileList');
  const uploadForm = document.getElementById('uploadForm');
  const submitBtn = document.getElementById('submitBtn');
  const guestNameInput = document.getElementById('guestName');
  const messageInput = document.getElementById('message');
  const uploadProgress = document.getElementById('uploadProgress');
  const progressFill = uploadProgress ? uploadProgress.querySelector('.progress-fill') : null;
  const statusDiv = document.getElementById('status');
  const photoGrid = document.getElementById('photoGrid');
  const videoGrid = document.getElementById('videoGrid');

  let stagedFiles = [];

  // =========================================================================
  // Drag-and-Drop & File Selection
  // =========================================================================
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleNewFiles(droppedFiles);
  });

  mediaInput.addEventListener('change', (e) => {
    const selectedFiles = Array.from(e.target.files);
    handleNewFiles(selectedFiles);
    mediaInput.value = '';
  });

  function handleNewFiles(files) {
    const validMedia = files.filter(file =>
      file.type.startsWith('image/') || file.type.startsWith('video/')
    );

    if (validMedia.length === 0) return;

    validMedia.forEach(file => {
      const exists = stagedFiles.some(f => f.name === file.name && f.size === file.size);
      if (!exists) {
        stagedFiles.push(file);
      }
    });

    renderPreviews();
  }

  function renderPreviews() {
    fileList.innerHTML = '';

    stagedFiles.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'file-list-item';

      const blobUrl = URL.createObjectURL(file);

      if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = blobUrl;
        img.alt = file.name;
        img.onload = () => URL.revokeObjectURL(blobUrl);
        item.appendChild(img);
      } else if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = blobUrl;
        video.muted = true;
        video.playsInline = true;
        item.appendChild(video);
      }

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.setAttribute('aria-label', `Remove ${file.name}`);
      removeBtn.innerHTML = '&times;';
      Object.assign(removeBtn.style, {
        position: 'absolute',
        top: '4px',
        right: '4px',
        background: 'rgba(0, 0, 0, 0.65)',
        color: '#fff',
        border: 'none',
        borderRadius: '50%',
        width: '22px',
        height: '22px',
        cursor: 'pointer',
        fontSize: '14px',
        lineHeight: '1',
        display: 'grid',
        placeContent: 'center'
      });

      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        stagedFiles.splice(index, 1);
        renderPreviews();
      });

      item.appendChild(removeBtn);
      fileList.appendChild(item);
    });
  }

  // =========================================================================
  // Supabase Direct Upload & Metadata Handling
  // =========================================================================
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      showStatus('Supabase configuration is missing in config.js.', 'error');
      return;
    }

    if (stagedFiles.length === 0) {
      showStatus('Please select at least one photo or video to upload.', 'error');
      return;
    }

    const guestName = guestNameInput.value.trim();
    const message = messageInput.value.trim();

    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading...';
    if (uploadProgress) {
      uploadProgress.hidden = false;
      progressFill.style.width = '0%';
    }
    statusDiv.textContent = '';

    const uploadedItems = [];

    try {
      for (let i = 0; i < stagedFiles.length; i++) {
        const file = stagedFiles[i];
        const isVideo = file.type.startsWith('video/');
        const folder = isVideo ? 'videos' : 'photos';
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName}`;

        // 1. Upload file to Supabase Storage
        await uploadFileToSupabase(filePath, file, (filePercent) => {
          if (uploadProgress && progressFill) {
            const overallPercent = ((i + filePercent / 100) / stagedFiles.length) * 100;
            progressFill.style.width = `${overallPercent}%`;
            uploadProgress.setAttribute('aria-valuenow', Math.round(overallPercent));
          }
        });

        // 2. Construct Public URL
        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filePath}`;

        const itemData = {
          type: isVideo ? 'video' : 'image',
          url: publicUrl,
          file_path: filePath,
          guest_name: guestName,
          message: message
        };

        // 3. Optional: Save guest name & message to Supabase "memories" table if it exists
        await saveMetadataToTable(itemData);

        uploadedItems.push({
          type: itemData.type,
          url: itemData.url,
          guestName: guestName,
          message: message
        });
      }

      showStatus('Thank you! Your memories were uploaded successfully.', 'success');
      appendMediaToGallery(uploadedItems);

      uploadForm.reset();
      stagedFiles = [];
      renderPreviews();
    } catch (err) {
      showStatus(err.message || 'Upload failed. Check your bucket permissions.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '❤️ Share With Bert & Beth';
      if (uploadProgress) uploadProgress.hidden = true;
    }
  });

  function uploadFileToSupabase(filePath, file, onProgress) {
    return new Promise((resolve, reject) => {
      const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filePath}`;
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress((e.loaded / e.total) * 100);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          let errMsg = `Upload error (${xhr.status})`;
          try {
            const resp = JSON.parse(xhr.responseText);
            if (resp.message || resp.error) errMsg = resp.message || resp.error;
          } catch {}
          reject(new Error(errMsg));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
      xhr.open('POST', url, true);
      xhr.setRequestHeader('apikey', SUPABASE_KEY);
      xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_KEY}`);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.send(file);
    });
  }

  async function saveMetadataToTable(itemData) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/memories`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(itemData)
      });
    } catch {
      // Ignore if the optional 'memories' table hasn't been created yet
    }
  }

  function showStatus(text, type) {
    statusDiv.textContent = text;
    statusDiv.style.color = type === 'error' ? '#C47A70' : '#4C7A5A';
  }

  // =========================================================================
  // Load Existing Memories from Supabase (Table or Storage Bucket Fallback)
  // =========================================================================
  async function loadGallery() {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;

    // 1. Try loading from the 'memories' table first (includes guest names & messages)
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/memories?select=*&order=created_at.asc`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });

      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          const items = rows.map(r => ({
            type: r.type || (r.url && r.url.match(/\.(mp4|mov|webm)$/i) ? 'video' : 'image'),
            url: r.url,
            guestName: r.guest_name || '',
            message: r.message || ''
          }));
          appendMediaToGallery(items);
          return;
        }
      }
    } catch {}

    // 2. Fallback: List files directly from the 'wedding-media' storage bucket folders
    try {
      const folders = ['photos', 'videos', ''];
      const allItems = [];

      for (const folder of folders) {
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prefix: folder,
            limit: 100,
            offset: 0,
            sortBy: { column: 'created_at', order: 'asc' }
          })
        });

        if (res.ok) {
          const files = await res.json();
          files.forEach(f => {
            if (!f.id || f.name === '.emptyFolderPlaceholder') return;
            const fullPath = folder ? `${folder}/${f.name}` : f.name;
            const isVideo = folder === 'videos' || (f.metadata && f.metadata.mimetype && f.metadata.mimetype.startsWith('video/')) || /\.(mp4|mov|webm)$/i.test(f.name);
            allItems.push({
              type: isVideo ? 'video' : 'image',
              url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fullPath}`,
              guestName: '',
              message: ''
            });
          });
        }
      }

      if (allItems.length > 0) {
        appendMediaToGallery(allItems);
      }
    } catch (err) {
      console.error('Could not load gallery from Supabase:', err);
    }
  }

  // =========================================================================
  // Gallery Rendering & Lightbox Controller
  // =========================================================================
  function appendMediaToGallery(items) {
    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'gallery-item';

      card.dataset.type = item.type || 'image';
      card.dataset.url = item.url;
      card.dataset.guestName = item.guestName || '';
      card.dataset.message = item.message || '';
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `View ${item.type || 'photo'} by ${item.guestName || 'a guest'}`);

      if (item.type === 'video') {
        const video = document.createElement('video');
        video.src = item.url;
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        card.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.src = item.url;
        img.alt = item.guestName ? `Uploaded by ${item.guestName}` : 'Wedding memory';
        img.loading = 'lazy';
        card.appendChild(img);
      }

      if (item.guestName || item.message) {
        const meta = document.createElement('div');
        meta.className = 'item-meta';
        meta.textContent = item.guestName ? `📸 ${item.guestName}` : 'Wedding memory';
        card.appendChild(meta);
      }

      if (item.type === 'video' && videoGrid) {
        videoGrid.prepend(card);
      } else if (photoGrid) {
        photoGrid.prepend(card);
      }
    });
  }

  // Lightbox Elements & Logic
  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    const lightboxStage = document.getElementById('lightboxStage');
    const lightboxClose = document.getElementById('lightboxClose');
    const lightboxPrev = document.getElementById('lightboxPrev');
    const lightboxNext = document.getElementById('lightboxNext');
    const lightboxCaption = document.getElementById('lightboxCaption');
    const lightboxAuthor = document.getElementById('lightboxAuthor');
    const lightboxMessage = document.getElementById('lightboxMessage');

    let galleryElements = [];
    let currentIndex = 0;
    let touchStartX = 0;

    const gallerySection = document.getElementById('gallery');
    gallerySection.addEventListener('click', (e) => {
      const card = e.target.closest('.gallery-item');
      if (card) openLightbox(card);
    });

    gallerySection.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.gallery-item');
        if (card) {
          e.preventDefault();
          openLightbox(card);
        }
      }
    });

    function openLightbox(clickedCard) {
      galleryElements = Array.from(document.querySelectorAll('.gallery-item'));
      currentIndex = galleryElements.indexOf(clickedCard);
      if (currentIndex === -1) return;

      updateLightboxContent();
      lightbox.showModal();
      document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
      stopActiveVideo();
      lightbox.close();
      document.body.style.overflow = '';
    }

    function showNext() {
      if (galleryElements.length <= 1) return;
      currentIndex = (currentIndex + 1) % galleryElements.length;
      updateLightboxContent();
    }

    function showPrev() {
      if (galleryElements.length <= 1) return;
      currentIndex = (currentIndex - 1 + galleryElements.length) % galleryElements.length;
      updateLightboxContent();
    }

    function stopActiveVideo() {
      const activeVideo = lightboxStage.querySelector('video');
      if (activeVideo) {
        activeVideo.pause();
        activeVideo.removeAttribute('src');
        activeVideo.load();
      }
    }

    function updateLightboxContent() {
      stopActiveVideo();
      lightboxStage.innerHTML = '';

      const activeCard = galleryElements[currentIndex];
      const type = activeCard.dataset.type || 'image';
      const url = activeCard.dataset.url;
      const guestName = activeCard.dataset.guestName || '';
      const message = activeCard.dataset.message || '';

      if (type === 'video') {
        const video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        lightboxStage.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.src = url;
        img.alt = guestName ? `Photo shared by ${guestName}` : 'Wedding memory';
        lightboxStage.appendChild(img);
      }

      if (guestName || message) {
        lightboxAuthor.textContent = guestName;
        lightboxMessage.textContent = message;
        lightboxCaption.hidden = false;
      } else {
        lightboxCaption.hidden = true;
      }

      const hideNav = galleryElements.length <= 1;
      lightboxPrev.hidden = hideNav;
      lightboxNext.hidden = hideNav;
    }

    lightboxClose.addEventListener('click', closeLightbox);
    lightboxNext.addEventListener('click', showNext);
    lightboxPrev.addEventListener('click', showPrev);

    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox || e.target.classList.contains('lightbox-wrapper') || e.target === lightboxStage) {
        closeLightbox();
      }
    });

    lightbox.addEventListener('close', () => {
      stopActiveVideo();
      document.body.style.overflow = '';
    });

    window.addEventListener('keydown', (e) => {
      if (!lightbox.open) return;
      if (e.key === 'ArrowRight') showNext();
      if (e.key === 'ArrowLeft') showPrev();
    });

    lightbox.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    lightbox.addEventListener('touchend', (e) => {
      const swipeDistance = e.changedTouches[0].screenX - touchStartX;
      if (Math.abs(swipeDistance) > 50) {
        swipeDistance < 0 ? showNext() : showPrev();
      }
    }, { passive: true });
  }

  loadGallery();
});
