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

        const authorEl = document.createElement('strong');
        authorEl.textContent = item.guestName ? `📸 ${item.guestName}` : 'Wedding Memory';
        meta.appendChild(authorEl);

        if (item.message) {
          const msgEl = document.createElement('span');
          msgEl.textContent = item.message;
          meta.appendChild(msgEl);
        }
        card.appendChild(meta);

        // ALSO display this message in the Guestbook Wishes wall below!
        appendMessagesToWall([{
          guestName: item.guestName,
          message: item.message,
          createdAt: item.createdAt || new Date().toISOString()
        }]);
      }

      if (item.type === 'video' && videoGrid) {
        videoGrid.prepend(card);
      } else if (photoGrid) {
        photoGrid.prepend(card);
      }
    });
  }
