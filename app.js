document.addEventListener('DOMContentLoaded', () => {
  const SCRIPT_URL = window.GOOGLE_SCRIPT_URL || '';

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
      // Google Apps Script has a ~50MB payload limit per file
      if (file.size > 45 * 1024 * 1024) {
        showStatus(`"${file.name}" is over 45MB. Please choose a shorter video or photo.`, 'error');
        return;
      }
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
  // Upload Files to Google Drive via Apps Script
  // =========================================================================
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!SCRIPT_URL || SCRIPT_URL.includes('PASTE_YOUR_WEB_APP_URL_HERE')) {
      showStatus('Please paste your Google Apps Script Web App URL in config.js.', 'error');
      return;
    }

    if (stagedFiles.length === 0) {
      showStatus('Please select at least one photo or video to upload.', 'error');
      return;
    }

    const guestName = guestNameInput.value.trim();
    const message = messageInput.value.trim();

    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading to Google Drive...';
    if (uploadProgress && progressFill) {
      uploadProgress.hidden = false;
      progressFill.style.width = '10%';
    }
    statusDiv.textContent = '';

    const uploadedItems = [];

    try {
      for (let i = 0; i < stagedFiles.length; i++) {
        const file = stagedFiles[i];
        const base64 = await fileToBase64(file);

        const payload = {
          fileName: `${Date.now()}-${file.name}`,
          mimeType: file.type || 'application/octet-stream',
          base64: base64,
          guestName: guestName,
          message: message
        };

        // Use text/plain to avoid CORS preflight blocks on Google Apps Script
        const response = await fetch(SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || 'Failed to upload to Google Drive');
        }

        uploadedItems.push(result.item);

        if (uploadProgress && progressFill) {
          const percent = Math.round(((i + 1) / stagedFiles.length) * 100);
          progressFill.style.width = `${percent}%`;
          uploadProgress.setAttribute('aria-valuenow', percent);
        }
      }

      showStatus('Thank you! Your memories were saved to Google Drive.', 'success');
      appendMediaToGallery(uploadedItems);

      uploadForm.reset();
      stagedFiles = [];
      renderPreviews();
    } catch (err) {
      showStatus(err.message || 'Upload failed. Check your Google Script deployment permissions.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '❤️ Share With Bert & Beth';
      if (uploadProgress) uploadProgress.hidden = true;
    }
  });

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  function showStatus(text, type) {
    statusDiv.textContent = text;
    statusDiv.style.color = type === 'error' ? '#C47A70' : '#4C7A5A';
  }

  // =========================================================================
  // Load Existing Gallery from Google Drive
  // =========================================================================
  async function loadGallery() {
    if (!SCRIPT_URL || SCRIPT_URL.includes('PASTE_YOUR_WEB_APP_URL_HERE')) return;

    try {
      const res = await fetch(SCRIPT_URL);
      const data = await res.json();
      if (data.items && Array.isArray(data.items)) {
        appendMediaToGallery(data.items);
      }
    } catch (err) {
      console.error('Could not load gallery from Google Drive:', err);
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

      if (item.type === 'video') {
        const video = document.createElement('video');
        video.src = item.url;
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        card.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.src = item.thumbnailUrl || item.url;
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

  // Lightbox Controller
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

    const gallerySection = document.getElementById('gallery');
    gallerySection.addEventListener('click', (e) => {
      const card = e.target.closest('.gallery-item');
      if (card) openLightbox(card);
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
  }

  loadGallery();
});
