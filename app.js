document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const dropzone = document.getElementById('dropzone');
  const mediaInput = document.getElementById('mediaInput');
  const fileList = document.getElementById('fileList');
  const uploadForm = document.getElementById('uploadForm');
  const submitBtn = document.getElementById('submitBtn');
  const guestNameInput = document.getElementById('guestName');
  const messageInput = document.getElementById('message');
  const uploadProgress = document.getElementById('uploadProgress');
  const progressFill = uploadProgress.querySelector('.progress-fill');
  const statusDiv = document.getElementById('status');
  const photoGrid = document.getElementById('photoGrid');
  const videoGrid = document.getElementById('videoGrid');

  // Internal state tracking selected files
  let stagedFiles = [];

  // =========================================================================
  // Drag-and-Drop Event Listeners
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
    // Reset file input so selecting the same file again still fires change event
    mediaInput.value = '';
  });

  // =========================================================================
  // File Staging & Thumbnail Previews
  // =========================================================================
  function handleNewFiles(files) {
    const validMedia = files.filter(file => 
      file.type.startsWith('image/') || file.type.startsWith('video/')
    );

    if (validMedia.length === 0) return;

    // Append new files avoiding exact duplicates
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

      // Close / Remove button
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
  // Form Submission & Progress Tracking
  // =========================================================================
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (stagedFiles.length === 0) {
      showStatus('Please select at least one photo or video to upload.', 'error');
      return;
    }

    const endpoint = (window.CONFIG && window.CONFIG.UPLOAD_URL) || '/api/upload';

    const formData = new FormData();
    formData.append('guestName', guestNameInput.value.trim());
    formData.append('message', messageInput.value.trim());
    stagedFiles.forEach(file => {
      formData.append('media', file);
    });

    // UI state during upload
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading...';
    uploadProgress.hidden = false;
    progressFill.style.width = '0%';
    uploadProgress.setAttribute('aria-valuenow', '0');
    statusDiv.textContent = '';

    try {
      const response = await uploadWithProgress(endpoint, formData, (percent) => {
        progressFill.style.width = `${percent}%`;
        uploadProgress.setAttribute('aria-valuenow', Math.round(percent));
      });

      showStatus('Thank you! Your memories were uploaded successfully.', 'success');
      
      // Update gallery live if the API returned newly created media items
      if (response && response.items) {
        appendMediaToGallery(response.items);
      }

      // Reset form
      uploadForm.reset();
      stagedFiles = [];
      renderPreviews();
    } catch (err) {
      showStatus(err.message || 'Upload failed. Please check your connection and try again.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '❤️ Share With Bert & Beth';
      uploadProgress.hidden = true;
    }
  });

  function uploadWithProgress(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const percentComplete = (e.loaded / e.total) * 100;
          onProgress(percentComplete);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch {
            resolve({ success: true });
          }
        } else {
          reject(new Error(`Server error: ${xhr.status} ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload.'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload was cancelled.'));
      });

      xhr.open('POST', url, true);
      xhr.send(formData);
    });
  }

  function showStatus(text, type) {
    statusDiv.textContent = text;
    statusDiv.style.color = type === 'error' ? '#C47A70' : '#4C7A5A';
  }

  // =========================================================================
  // Gallery Rendering Utility
  // =========================================================================
  function appendMediaToGallery(items) {
    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'gallery-item';

      if (item.type === 'video') {
        const video = document.createElement('video');
        video.src = item.url;
        video.controls = true;
        video.preload = 'metadata';
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
        meta.textContent = item.guestName || 'A guest';
        card.appendChild(meta);
      }

      if (item.type === 'video' && videoGrid) {
        videoGrid.prepend(card);
      } else if (photoGrid) {
        photoGrid.prepend(card);
      }
    });
  }
});
