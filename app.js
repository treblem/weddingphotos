document.addEventListener('DOMContentLoaded', () => {
  const SCRIPT_URL = window.GOOGLE_SCRIPT_URL || '';

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

  // Drag-and-drop & File Selection
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
    handleNewFiles(Array.from(e.dataTransfer.files));
  });

  mediaInput.addEventListener('change', (e) => {
    handleNewFiles(Array.from(e.target.files));
    mediaInput.value = '';
  });

  function handleNewFiles(files) {
    const validMedia = files.filter(file =>
      file.type.startsWith('image/') || file.type.startsWith('video/')
    );

    if (validMedia.length === 0) return;

    validMedia.forEach(file => {
      if (file.size > 35 * 1024 * 1024) {
        showStatus(`"${file.name}" is over 35MB. Please choose a smaller file.`, 'error');
        return;
      }
      const exists = stagedFiles.some(f => f.name === file.name && f.size === file.size);
      if (!exists) stagedFiles.push(file);
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
        position: 'absolute', top: '4px', right: '4px',
        background: 'rgba(0, 0, 0, 0.65)', color: '#fff',
        border: 'none', borderRadius: '50%', width: '22px', height: '22px',
        cursor: 'pointer', fontSize: '14px', lineHeight: '1', display: 'grid', placeContent: 'center'
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

  // Form Submission
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!SCRIPT_URL || SCRIPT_URL.includes('PASTE_YOUR_WEB_APP_URL_HERE')) {
      showStatus('Please configure your Google Apps Script URL in config.js.', 'error');
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
    if (uploadProgress && progressFill) {
      uploadProgress.hidden = false;
      progressFill.style.width = '15%';
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

        const response = await fetch(SCRIPT_URL, {
          method: 'POST',
          redirect: 'follow',
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Failed to upload file');

        if (result.item) uploadedItems.push(result.item);

        if (uploadProgress && progressFill) {
          const percent = Math.round(((i + 1) / stagedFiles.length) * 100);
          progressFill.style.width = `${percent}%`;
          uploadProgress.setAttribute('aria-valuenow', percent);
        }
      }

      showStatus('Thank you! Your memories were uploaded successfully.', 'success');
      if (uploadedItems.length > 0) appendMediaToGallery(uploadedItems);

      uploadForm.reset();
      stagedFiles = [];
      renderPreviews();
    } catch (err) {
      showStatus(err.message || 'Upload failed. Check your network or Apps Script permissions.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '❤️ Share With Bert & Beth';
      if (uploadProgress) uploadProgress.hidden = true;
    }
  });

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  function showStatus(text, type) {
    statusDiv.textContent = text;
    statusDiv.style.color = type === 'error' ? '#C47A70' : '#4C7A5A';
  }

  // Load Initial Gallery
  async function loadGallery() {
    if (!SCRIPT_URL || SCRIPT_URL.includes('PASTE_YOUR_WEB_APP_URL_HERE')) return;

    try {
      const res = await fetch(SCRIPT_URL, { redirect: 'follow' });
      const data = await res.json();
      if (data.items && Array.isArray(data.items)) {
        appendMediaToGallery(data.items);
      }
    } catch (err) {
      console.error('Could not load gallery from Google Drive:', err);
    }
  }

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
        // Extract Google Drive File ID from URL
        const fileIdMatch = item.url.match(/id=([a-zA-Z0-9_-]+)/) || item.url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        const fileId = fileIdMatch ? fileIdMatch[1] : '';

        const iframe = document.createElement('iframe');
        iframe.src = `https://drive.google.com/file/d/${fileId}/preview`;
        iframe.width = "100%";
        iframe.height = "100%";
        iframe.style.border = "none";
        iframe.style.pointerEvents = "none"; // Allows clicking the card to open lightbox
        card.appendChild(iframe);
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

        const authorEl = document.createElement('strong');
        authorEl.textContent = item.guestName ? `📸 ${item.guestName}` : 'Wedding Memory';
        meta.appendChild(authorEl);

        if (item.message) {
          const msgEl = document.createElement('span');
          msgEl.textContent = item.message;
          meta.appendChild(msgEl);
        }
        card.appendChild(meta);
      }

      if (item.type === 'video' && videoGrid) {
        videoGrid.prepend(card);
      } else if (photoGrid) {
        photoGrid.prepend(card);
      }
    });
  }

  // Lightbox with Google Drive Preview Iframe
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

    function updateLightboxContent() {
      lightboxStage.innerHTML = '';

      const activeCard = galleryElements[currentIndex];
      const type = activeCard.dataset.type || 'image';
      const url = activeCard.dataset.url;
      const guestName = activeCard.dataset.guestName || '';
      const message = activeCard.dataset.message || '';

      if (type === 'video') {
        const fileIdMatch = url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        const fileId = fileIdMatch ? fileIdMatch[1] : '';

        const iframe = document.createElement('iframe');
        iframe.src = `https://drive.google.com/file/d/${fileId}/preview`;
        iframe.width = "100%";
        iframe.height = "100%";
        iframe.style.border = "none";
        iframe.style.borderRadius = "var(--radius-sm)";
        iframe.setAttribute('allow', 'autoplay');
        lightboxStage.appendChild(iframe);
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
