// Shared between the control window's "live preview" mirror and the actual
// live output window, so both always render a slide identically.
// Loaded as a plain <script> tag (no bundler / module system needed).

(function () {
  const REFERENCE_WIDTH = 1920; // font sizes in theme JSON are authored for a 1920px-wide screen

  function removeVideoEl(containerEl) {
    const existing = containerEl.querySelector('video.bg-video');
    if (existing) existing.remove();
  }

  function applyPayload(payload, containerEl, textEl) {
    containerEl.classList.remove('align-top', 'align-bottom');

    if (!payload || payload.mode === 'black') {
      removeVideoEl(containerEl);
      containerEl.style.backgroundImage = 'none';
      containerEl.style.backgroundColor = '#000000';
      textEl.style.display = 'none';
      textEl.textContent = '';
      return;
    }

    if (payload.mode === 'logo') {
      removeVideoEl(containerEl);
      containerEl.style.backgroundColor = '#000000';
      if (payload.logoPath) {
        containerEl.style.backgroundImage = `url("${payload.logoPath}")`;
        containerEl.style.backgroundSize = 'contain';
        containerEl.style.backgroundRepeat = 'no-repeat';
        containerEl.style.backgroundPosition = 'center';
      } else {
        containerEl.style.backgroundImage = 'none';
      }
      textEl.style.display = 'none';
      textEl.textContent = '';
      return;
    }

    // modes: 'clear' (background only) or 'slide' (background + text)
    const bg = payload.background || { type: 'color', value: '#000000' };
    removeVideoEl(containerEl);
    containerEl.style.backgroundSize = 'cover';
    containerEl.style.backgroundPosition = 'center';

    if (bg.type === 'video') {
      containerEl.style.backgroundImage = 'none';
      containerEl.style.backgroundColor = '#000000';
      const vid = document.createElement('video');
      vid.className = 'bg-video';
      vid.src = bg.value;
      vid.autoplay = true;
      vid.loop = true;
      vid.muted = true;
      vid.style.position = 'absolute';
      vid.style.inset = '0';
      vid.style.width = '100%';
      vid.style.height = '100%';
      vid.style.objectFit = 'cover';
      containerEl.prepend(vid);
    } else if (bg.type === 'image') {
      containerEl.style.backgroundImage = `url("${bg.value}")`;
      containerEl.style.backgroundColor = '#000000';
    } else {
      containerEl.style.backgroundImage = 'none';
      containerEl.style.backgroundColor = bg.value || '#000000';
    }

    if (payload.mode === 'clear') {
      textEl.style.display = 'none';
      textEl.textContent = '';
      return;
    }

    // mode: 'slide'
    const font = payload.font || {};
    const scale = Math.max(0.05, (containerEl.clientWidth || REFERENCE_WIDTH) / REFERENCE_WIDTH);

    textEl.style.display = 'block';
    textEl.textContent = payload.text || '';
    textEl.style.fontFamily = font.family || 'Georgia, serif';
    textEl.style.fontSize = Math.round((font.size || 64) * scale) + 'px';
    textEl.style.color = font.color || '#ffffff';
    textEl.style.fontWeight = font.weight || '700';
    textEl.style.textShadow = payload.shadow
      ? '0 2px 10px rgba(0,0,0,.85), 0 0 2px rgba(0,0,0,.9)'
      : 'none';

    const align = payload.align || 'middle';
    if (align === 'top') containerEl.classList.add('align-top');
    if (align === 'bottom') containerEl.classList.add('align-bottom');
  }

  window.WorshipRender = { applyPayload };
})();
