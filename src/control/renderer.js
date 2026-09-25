// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  songs: [],
  scripture: null,
  media: [],
  themes: [],
  settings: {},
  schedule: [],
  scheduleSelectedItemId: null,
  currentItemId: null,
  previewItem: null,
  selectedItemId: null,
  selectedSlideId: null,
  liveItemId: null,
  liveSlideId: null,
  editingSongId: null,
  editingThemeId: null,
  lastPayload: null,
  lastSlidePayload: null,
  lastSlideItemId: null,
  lastSlideId: null,
  screenModes: { logo: false, black: false, clear: false },
  slideViewMode: 'grid',
  outputDisplays: [],
  labelColorUndoStack: [],
  labelColorRedoStack: [],
};

let pendingThemeBg = { type: 'color', value: '#000000' };
let liveOpen = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function defaultThemeClient() {
  return {
    id: 'default', name: 'Default',
    background: { type: 'color', value: '#000000' },
    font: { family: 'Georgia, serif', size: 64, color: '#ffffff', weight: '700' },
    align: 'middle', shadow: true,
  };
}

function songSections(song) {
  const source = Array.isArray(song.sections) && song.sections.length
    ? song.sections
    : Array.isArray(song.slides) ? song.slides : [];
  return source
    .map((section) => ({
      id: section.id || uid(),
      label: section.label || '',
      lyrics: section.lyrics !== undefined ? section.lyrics : (section.text || ''),
    }));
}

function normalizeSong(song) {
  const sections = songSections(song);
  return {
    ...song,
    sections,
    slides: sections.map((section) => ({
      id: section.id,
      label: section.label,
      text: section.lyrics,
    })),
  };
}

function setStatus(msg) {
}

function applyThemeMode() {
  const lightMode = state.settings.themeMode === 'light';
  document.body.classList.toggle('light-mode', lightMode);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function setupPanelResize() {
  const main = document.getElementById('main');
  const workArea = document.getElementById('workArea');
  const scheduleCol = document.getElementById('scheduleCol');
  const contentHub = document.getElementById('contentHub');
  const scheduleSplitter = document.getElementById('scheduleSplitter');
  const previewSplitter = document.getElementById('previewSplitter');
  const contentHubSplitter = document.getElementById('contentHubSplitter');
  const layout = state.settings.layout || {};

  if (layout.scheduleWidth) scheduleCol.style.flexBasis = `${layout.scheduleWidth}px`;
  if (layout.previewWidth) document.getElementById('previewBox').style.flexBasis = `${layout.previewWidth}px`;
  if (layout.contentHubHeight) contentHub.style.flexBasis = `${layout.contentHubHeight}px`;

  function saveLayout() {
    state.settings.layout = {
      scheduleWidth: Math.round(scheduleCol.getBoundingClientRect().width),
      previewWidth: Math.round(document.getElementById('previewBox').getBoundingClientRect().width),
      contentHubHeight: Math.round(contentHub.getBoundingClientRect().height),
    };
    persistSettings();
  }
  function previewAspect() {
    const display = state.outputDisplays.find((candidate) => String(candidate.id)
      === String(document.getElementById('displaySelect').value));
    return display && display.height ? display.width / display.height : 16 / 9;
  }

  function previewBounds() {
    const previewBox = document.getElementById('previewBox');
    const previewHorizontalMargin = 24;
    const previewVerticalMargin = 56;
    const scheduleSplitterWidth = scheduleSplitter.getBoundingClientRect().width;
    const splitterWidth = previewSplitter.getBoundingClientRect().width;
    const scheduleWidth = scheduleCol.getBoundingClientRect().width;
    const slideMinimum = 260;
    const horizontalMaximum = workArea.clientWidth - scheduleWidth - scheduleSplitterWidth
      - splitterWidth - slideMinimum - previewHorizontalMargin;
    const verticalMaximum = Math.max(240, (workArea.clientHeight - previewVerticalMargin) * previewAspect());
    const windowMaximum = main.clientWidth / 3;
    return {
      previewBox,
      min: 240,
      max: Math.max(240, Math.min(windowMaximum, horizontalMaximum, verticalMaximum)),
    };
  }

  function constrainPreviewWidth() {
    const bounds = previewBounds();
    const width = clamp(bounds.previewBox.getBoundingClientRect().width, bounds.min, bounds.max);
    const previewPanel = document.getElementById('previewPanel');
    bounds.previewBox.style.flexBasis = `${width}px`;
    bounds.previewBox.style.width = `${width}px`;
    previewPanel.style.flexBasis = `${width + previewSplitter.getBoundingClientRect().width + 24}px`;
    refreshPreviewLayout();
  }

  function constrainScheduleWidth() {
    const previewWidth = document.getElementById('previewBox').getBoundingClientRect().width + 24;
    const availableMaximum = workArea.clientWidth - scheduleSplitter.getBoundingClientRect().width
      - previewSplitter.getBoundingClientRect().width - previewWidth - 260;
    const hubAlignmentWidth = document.getElementById('tabs').getBoundingClientRect().width
      + document.querySelector('.song-filters').getBoundingClientRect().width;
    const maxWidth = Math.min(hubAlignmentWidth, availableMaximum);
    const width = clamp(scheduleCol.getBoundingClientRect().width, 180, maxWidth);
    scheduleCol.style.flexBasis = `${width}px`;
  }

  function contentHubMaximum() {
    const mainRect = main.getBoundingClientRect();
    const previewRect = document.getElementById('previewBox').getBoundingClientRect();
    const splitterHeight = contentHubSplitter.getBoundingClientRect().height;
    const previewPanelGap = 12;
    const previewBottom = previewRect.bottom - mainRect.top;
    return Math.max(180, main.clientHeight - splitterHeight - previewBottom - previewPanelGap);
  }

  function constrainContentHubHeight() {
    const maxHeight = contentHubMaximum();
    const height = clamp(contentHub.getBoundingClientRect().height, 180, maxHeight);
    contentHub.style.flexBasis = `${height}px`;
  }

  constrainScheduleWidth();
  constrainPreviewWidth();
  constrainContentHubHeight();

  scheduleSplitter.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = scheduleCol.getBoundingClientRect().width;
    const splitterWidth = scheduleSplitter.getBoundingClientRect().width;
    scheduleSplitter.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing');

    const resize = (moveEvent) => {
      const previewWidth = document.getElementById('previewBox').getBoundingClientRect().width + 24;
      const maxWidth = Math.min(
        document.getElementById('tabs').getBoundingClientRect().width
          + document.querySelector('.song-filters').getBoundingClientRect().width,
        workArea.clientWidth - splitterWidth - 8 - previewWidth - 260,
      );
      const width = clamp(startWidth + moveEvent.clientX - startX, 180, maxWidth);
      scheduleCol.style.flexBasis = `${width}px`;
      syncCombinedPreview();
    };
    const stop = () => {
      scheduleSplitter.removeEventListener('pointermove', resize);
      scheduleSplitter.removeEventListener('pointerup', stop);
      scheduleSplitter.removeEventListener('pointercancel', stop);
      document.body.classList.remove('resizing');
      saveLayout();
    };
    scheduleSplitter.addEventListener('pointermove', resize);
    scheduleSplitter.addEventListener('pointerup', stop);
    scheduleSplitter.addEventListener('pointercancel', stop);
  });

  previewSplitter.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const previewBox = document.getElementById('previewBox');
    const slidePanel = document.getElementById('slidePanel');
    const displayArea = document.getElementById('displayArea');
    const startX = event.clientX;
    const startWidth = previewBox.getBoundingClientRect().width;
    const splitterWidth = previewSplitter.getBoundingClientRect().width;
    previewSplitter.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing');

    const resize = (moveEvent) => {
      const bounds = previewBounds();
      const width = clamp(startWidth + startX - moveEvent.clientX, bounds.min, bounds.max);
      const panelWidth = width + splitterWidth + 24;
      previewBox.style.flexBasis = `${width}px`;
      previewBox.style.width = `${width}px`;
      previewPanel.style.flexBasis = `${panelWidth}px`;
      previewPanel.style.width = `${panelWidth}px`;
      slidePanel.style.flexBasis = `${Math.max(260, displayArea.clientWidth - panelWidth)}px`;
      refreshPreviewLayout();
    };
    const stop = () => {
      previewSplitter.removeEventListener('pointermove', resize);
      previewSplitter.removeEventListener('pointerup', stop);
      previewSplitter.removeEventListener('pointercancel', stop);
      document.body.classList.remove('resizing');
      saveLayout();
    };
    previewSplitter.addEventListener('pointermove', resize);
    previewSplitter.addEventListener('pointerup', stop);
    previewSplitter.addEventListener('pointercancel', stop);
  });

  contentHubSplitter.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = contentHub.getBoundingClientRect().height;
    contentHubSplitter.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing');

    const resize = (moveEvent) => {
      const maxHeight = contentHubMaximum();
      const height = clamp(startHeight + startY - moveEvent.clientY, 180, maxHeight);
      contentHub.style.flexBasis = `${height}px`;
      constrainPreviewWidth();
    };
    const stop = () => {
      contentHubSplitter.removeEventListener('pointermove', resize);
      contentHubSplitter.removeEventListener('pointerup', stop);
      contentHubSplitter.removeEventListener('pointercancel', stop);
      document.body.classList.remove('resizing');
      saveLayout();
    };
    contentHubSplitter.addEventListener('pointermove', resize);
    contentHubSplitter.addEventListener('pointerup', stop);
    contentHubSplitter.addEventListener('pointercancel', stop);
  });
}

function persistSongs() { window.api.saveData('library.json', state.songs); }
function persistMedia() { window.api.saveData('media.json', state.media); }
function persistThemes() { window.api.saveData('themes.json', state.themes); }
function persistSettings() { return window.api.saveData('settings.json', state.settings); }

function colorLuminance(color) {
  const hex = String(color).replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return 0;
  const channels = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return channels.reduce((total, channel, index) => {
    const linear = channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return total + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

function updateColorContrastOutline(colorInput) {
  const panelColor = document.body.classList.contains('light-mode') ? '#ffffff' : '#23262f';
  const colorLuma = colorLuminance(colorInput.value);
  const panelLuma = colorLuminance(panelColor);
  const contrast = (Math.max(colorLuma, panelLuma) + 0.05) / (Math.min(colorLuma, panelLuma) + 0.05);
  const needsOutline = contrast < 1.5;
  colorInput.classList.toggle('needs-contrast-outline', needsOutline);
  colorInput.style.setProperty('--color-outline', document.body.classList.contains('light-mode') ? '#20242c' : '#e7e9ee');
}

function updateSectionLabelColorOutlines() {
  document.querySelectorAll('.label-color-input, #sectionLabelColor').forEach(updateColorContrastOutline);
}

function recordSectionLabelColorChange(label, fromColor, toColor) {
  if (!label || fromColor === toColor) return;
  state.labelColorUndoStack.push({ label, fromColor, toColor });
  state.labelColorRedoStack = [];
}

function applySectionLabelColorHistory(entry, color) {
  state.settings.sectionLabelColors = state.settings.sectionLabelColors || {};
  state.settings.sectionLabelColors[entry.label] = color;
  persistSettings();
  renderSectionLabelColors();
  renderSlideGrid();
}

function undoSectionLabelColor() {
  const entry = state.labelColorUndoStack.pop();
  if (!entry) return false;
  applySectionLabelColorHistory(entry, entry.fromColor);
  state.labelColorRedoStack.push(entry);
  return true;
}

function redoSectionLabelColor() {
  const entry = state.labelColorRedoStack.pop();
  if (!entry) return false;
  applySectionLabelColorHistory(entry, entry.toColor);
  state.labelColorUndoStack.push(entry);
  return true;
}

function syncCombinedPreview() {
  const workArea = document.getElementById('workArea');
  const previewBox = document.getElementById('previewBox');
  const previewHeader = document.getElementById('previewHeader');
  if (!workArea.classList.contains('view-combined')) {
    previewBox.style.removeProperty('width');
    previewHeader.style.removeProperty('width');
    return;
  }
  const width = document.getElementById('scheduleCol').getBoundingClientRect().width;
  previewBox.style.width = `${width}px`;
  previewHeader.style.width = `${width}px`;
}

function applyWorkspaceView(view) {
  const selectedView = ['preview-live', 'combined', 'live-resource'].includes(view)
    ? view : 'live-resource';
  const workArea = document.getElementById('workArea');
  workArea.classList.remove('view-preview-live', 'view-combined', 'view-live-resource');
  workArea.classList.add(`view-${selectedView}`);
  state.settings.viewMode = selectedView;
  syncCombinedPreview();
  window.api.setViewMode(selectedView);
  persistSettings();
}

function fillThemeSelect(selectEl, selectedId) {
  selectEl.innerHTML = '';
  state.themes.forEach((t) => {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = `Theme: ${t.name}`;
    if (t.id === selectedId) o.selected = true;
    selectEl.appendChild(o);
  });
}

function themeFor(item) {
  return state.themes.find((t) => t.id === item.themeId)
    || state.themes.find((t) => t.id === 'default')
    || defaultThemeClient();
}

// ---------------------------------------------------------------------------
// Rendering: Songs / Scripture / Media / Themes (content hub)
// ---------------------------------------------------------------------------
function renderSongs(filter) {
  const container = document.getElementById('songList');
  container.innerHTML = '';
  const f = (filter || '').toLowerCase().trim();
  const field = document.getElementById('songFilterField').value;
  const songs = Array.isArray(state.songs) ? state.songs : [];
  const scoreSong = (song) => {
    if (!f) return 0;
    const title = String(song.title || '').toLowerCase();
    const lyrics = (Array.isArray(song.slides) ? song.slides : [])
      .map((slide) => String(slide.text || '')).join('\n').toLowerCase();
    const author = String(song.author || '').toLowerCase();
    const values = field === 'lyrics' ? [lyrics] : field === 'author' ? [author] : [title];
    let score = 0;
    values.forEach((value) => {
      if (value === f) score = Math.max(score, 100);
      else if (value.startsWith(f)) score = Math.max(score, 80);
      else if (value.includes(f)) score = Math.max(score, 60);
    });
    return score;
  };
  const list = songs.filter((song) => !f || scoreSong(song) > 0)
    .sort((a, b) => scoreSong(b) - scoreSong(a));

  list.forEach((song, index) => {
    const slides = Array.isArray(song.slides) ? song.slides : [];
    const item = document.createElement('div');
    item.className = `list-item song-match${f && index === 0 ? ' selected' : ''}`;
    item.draggable = true;
    item.title = 'Right-click or drag to add to schedule · double-click to display';
    item.innerHTML = `<div class="title">${escapeHtml(song.title || 'Untitled song')}</div>`
      + `<div class="sub song-author">${escapeHtml(song.author || '')}</div>`
      + `<div class="sub song-slide-count">${slides.length}</div>`;
    item.addEventListener('click', () => {
      container.querySelectorAll('.song-match').forEach((row) => row.classList.remove('selected'));
      item.classList.add('selected');
    });
    item.addEventListener('dblclick', () => displayLibrarySong(song));
    item.addEventListener('dragstart', (event) => {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('application/x-song-id', song.id);
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => item.classList.remove('dragging'));
    item.addEventListener('contextmenu', (event) => openSongContextMenu(event, song));
    container.appendChild(item);
  });
  if (!list.length) container.innerHTML = '<div class="group-header">No songs match</div>';
}

function renderScripture(filter, prefix = 'scripture') {
  const container = document.getElementById(`${prefix}List`);
  container.innerHTML = '';
  if (!state.scripture || !Array.isArray(state.scripture.books) || !state.scripture.books.length) {
    container.innerHTML = '<div class="group-header">No scripture loaded — import a Bible JSON above</div>';
    return;
  }
  const f = (filter || '').toLowerCase().trim();
  const field = document.getElementById(`${prefix}FilterField`).value;

  if (!f) {
    state.scripture.books.forEach((b) => {
      const header = document.createElement('div');
      header.className = 'group-header';
      header.textContent = b.book;
      container.appendChild(header);
      b.chapters.forEach((c) => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.title = 'Click to preview; double-click to add the whole chapter to the schedule';
        item.innerHTML = `<div class="title">${escapeHtml(b.book)} ${c.chapter}</div>`
          + `<div class="sub">${c.verses.length} verses</div>`;
        item.addEventListener('click', () => previewLibraryScripture(b.book, c));
        item.addEventListener('dblclick', () => addScriptureChapterToSchedule(b.book, c));
        container.appendChild(item);
      });
    });
    return;
  }

  const matches = [];
  state.scripture.books.forEach((b) => {
    b.chapters.forEach((c) => {
      c.verses.forEach((v) => {
        const ref = `${b.book} ${c.chapter}:${v.verse}`;
        const title = ref.toLowerCase();
        const lyrics = v.text.toLowerCase();
        const author = String(state.scripture.translation || '').toLowerCase();
        const values = field === 'title' ? [title]
          : field === 'lyrics' ? [lyrics]
            : field === 'author' ? [author] : [title, lyrics, author];
        if (values.some((value) => value.includes(f))) {
          matches.push({ book: b.book, chapterObj: c, verse: v });
        }
      });
    });
  });

  matches.slice(0, 200).forEach((m) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.title = 'Click to preview; double-click to add to schedule';
    item.innerHTML = `<div class="title">${escapeHtml(m.book)} ${m.chapterObj.chapter}:${m.verse.verse}</div>`
      + `<div class="sub">${escapeHtml(m.verse.text.slice(0, 90))}</div>`;
    item.addEventListener('click', () => previewLibraryVerse(m.book, m.chapterObj, m.verse));
    item.addEventListener('dblclick', () => addScriptureVerseRangeToSchedule(m.book, m.chapterObj, m.verse.verse));
    container.appendChild(item);
  });
  if (!matches.length) container.innerHTML = '<div class="group-header">No matches</div>';
}

function renderMedia(filter) {
  const container = document.getElementById('mediaList');
  container.innerHTML = '';
  const f = (filter || '').toLowerCase().trim();
  const field = document.getElementById('mediaFilterField').value;
  const media = state.media.filter((m) => {
    if (!f) return true;
    const title = String(m.name || '').toLowerCase();
    const type = String(m.type || '').toLowerCase();
    const values = field === 'title' ? [title] : field === 'author' ? [type] : [title, type];
    return values.some((value) => value.includes(f));
  });
  media.forEach((m) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.title = 'Click to add to schedule as a full-screen media slide';
    item.innerHTML = `<div class="title">${m.type === 'video' ? '🎬' : '🖼️'} ${escapeHtml(m.name)}</div>`
      + `<div class="sub">${m.type}</div>`;
    item.addEventListener('click', () => addMediaToSchedule(m));
    container.appendChild(item);
  });
  if (!media.length) container.innerHTML = `<div class="group-header">${state.media.length ? 'No media matches' : 'No media yet'}</div>`;
}

function renderThemes(filter) {
  const container = document.getElementById('themeList');
  container.innerHTML = '';
  const f = (filter || '').toLowerCase().trim();
  const field = document.getElementById('themeFilterField').value;
  const themes = state.themes.filter((t) => {
    if (!f) return true;
    const title = String(t.name || '').toLowerCase();
    const type = String(t.background.type || '').toLowerCase();
    const values = field === 'title' ? [title] : field === 'author' ? [type] : [title, type];
    return values.some((value) => value.includes(f));
  });
  themes.forEach((t) => {
    const swatchColor = t.background.type === 'color' ? t.background.value : '#555';
    const item = document.createElement('div');
    item.className = 'list-item';
    item.style.borderLeft = `4px solid ${swatchColor}`;
    item.innerHTML = `<div class="title">${escapeHtml(t.name)}</div>`
      + `<div class="sub">${t.background.type} background · ${t.font.size}px ${escapeHtml(t.font.family)}</div>`;
    item.addEventListener('click', () => openThemeEditor(t.id));
    container.appendChild(item);
  });
  if (!themes.length) container.innerHTML = '<div class="group-header">No themes match</div>';
}

// ---------------------------------------------------------------------------
// Adding items to the schedule
// ---------------------------------------------------------------------------
function addSongToSchedule(song, insertIndex = state.schedule.length) {
  const slides = (Array.isArray(song.slides) ? song.slides : []).map((sl) => ({ id: uid(), label: sl.label, text: sl.text }));
  if (!slides.length) return;
  state.schedule.splice(insertIndex, 0, { id: uid(), type: 'song', title: song.title, themeId: song.themeId || 'default', slides });
  renderSchedule();
  setStatus(`Added "${song.title}" to schedule`);
}

function addScriptureChapterToSchedule(book, chapterObj) {
  const perSlide = Math.max(1, parseInt(document.getElementById('versesPerSlide').value, 10) || 1);
  const slides = [];
  for (let i = 0; i < chapterObj.verses.length; i += perSlide) {
    const group = chapterObj.verses.slice(i, i + perSlide);
    const label = group.length > 1 ? `v.${group[0].verse}-${group[group.length - 1].verse}` : `v.${group[0].verse}`;
    const text = group.map((v) => `${v.verse} ${v.text}`).join('\n');
    slides.push({ id: uid(), label, text });
  }
  const title = `${book} ${chapterObj.chapter}`;
  state.schedule.push({ id: uid(), type: 'scripture', title, themeId: 'default', slides });
  renderSchedule();
  setStatus(`Added ${title} to schedule`);
}

function addScriptureVerseRangeToSchedule(book, chapterObj, startVerse) {
  const perSlide = Math.max(1, parseInt(document.getElementById('versesPerSlide').value, 10) || 1);
  const idx = chapterObj.verses.findIndex((v) => v.verse === startVerse);
  if (idx === -1) return;
  const group = chapterObj.verses.slice(idx, idx + perSlide);
  const title = group.length > 1
    ? `${book} ${chapterObj.chapter}:${group[0].verse}-${group[group.length - 1].verse}`
    : `${book} ${chapterObj.chapter}:${group[0].verse}`;
  const text = group.map((v) => `${v.verse} ${v.text}`).join('\n');
  state.schedule.push({ id: uid(), type: 'scripture', title, themeId: 'default', slides: [{ id: uid(), label: 'Verse', text }] });
  renderSchedule();
  setStatus(`Added ${title} to schedule`);
}

function addMediaToSchedule(m) {
  const item = {
    id: uid(), type: 'media', title: m.name, themeId: 'default',
    slides: [{ id: uid(), label: 'Media', text: '', background: { type: m.type, value: window.api.toFileUrl(m.path) } }],
  };
  state.schedule.push(item);
  renderSchedule();
  setStatus(`Added media "${m.name}" to schedule`);
}

// ---------------------------------------------------------------------------
// Schedule list (drag to reorder)
// ---------------------------------------------------------------------------
function renderSchedule() {
  const container = document.getElementById('scheduleList');
  container.innerHTML = '';
  container.classList.add('schedule-list');
  const dropIndicator = document.createElement('div');
  dropIndicator.className = 'schedule-drop-indicator';
  dropIndicator.hidden = true;
  container.appendChild(dropIndicator);

  const clearSongDrop = () => {
    dropIndicator.hidden = true;
    container.classList.remove('drag-over-end');
  };
  const showSongDrop = (index, top) => {
    dropIndicator.style.top = `${top}px`;
    dropIndicator.hidden = false;
    container.classList.toggle('drag-over-end', index === state.schedule.length);
  };

  state.schedule.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = `sched-item${item.id === state.scheduleSelectedItemId ? ' active' : ''}`;
    row.draggable = true;
    const icon = item.type === 'song' ? '🎵' : item.type === 'scripture' ? '📖' : '🖼️';
    row.innerHTML = `<span class="icon">${icon}</span>`
      + `<div class="info"><div class="title">${escapeHtml(item.title)}</div>`
      + `<div class="sub">${item.slides.length} slide${item.slides.length === 1 ? '' : 's'}</div></div>`
      + '<span class="remove">✕</span>';

    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove')) return;
      highlightScheduleItem(item.id, e.currentTarget);
    });
    row.addEventListener('dblclick', (e) => {
      if (e.target.classList.contains('remove')) return;
      displayScheduleItem(item.id);
    });
    row.querySelector('.remove').addEventListener('click', () => removeScheduleItem(item.id));
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
      e.dataTransfer.setData('application/x-schedule-index', String(idx));
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-song-id') ? 'copy' : 'move';
      if (e.dataTransfer.types.includes('application/x-song-id')) {
        const insertIndex = e.clientY >= row.getBoundingClientRect().top + row.offsetHeight / 2
          ? idx + 1 : idx;
        const top = insertIndex === idx ? row.offsetTop : row.offsetTop + row.offsetHeight;
        row.dataset.songDropIndex = String(insertIndex);
        showSongDrop(insertIndex, top);
      }
    });
    row.addEventListener('dragleave', () => {
      delete row.dataset.songDropIndex;
      clearSongDrop();
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearSongDrop();
      const songId = e.dataTransfer.getData('application/x-song-id');
      if (songId) {
        const song = state.songs.find((candidate) => candidate.id === songId);
        const insertIndex = Number.isInteger(Number(row.dataset.songDropIndex))
          ? Number(row.dataset.songDropIndex) : idx;
        if (song) addSongToSchedule(song, insertIndex);
        return;
      }
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (Number.isNaN(fromIdx) || fromIdx === idx) return;
      const [moved] = state.schedule.splice(fromIdx, 1);
      state.schedule.splice(idx, 0, moved);
      renderSchedule();
    });
    container.appendChild(row);
  });
  container.ondragover = (e) => {
    if (!e.dataTransfer.types.includes('application/x-song-id')) return;
    if (e.target.closest('.sched-item')) return;
    e.preventDefault();
    const lastRow = container.querySelector('.sched-item:last-of-type');
    const bottom = lastRow ? lastRow.offsetTop + lastRow.offsetHeight : 6;
    showSongDrop(state.schedule.length, bottom);
    container.classList.add('drag-over-end');
  };
  container.ondragleave = () => clearSongDrop();
  container.ondrop = (e) => {
    e.preventDefault();
    clearSongDrop();
    const songId = e.dataTransfer.getData('application/x-song-id');
    const song = state.songs.find((candidate) => candidate.id === songId);
    if (song) addSongToSchedule(song, state.schedule.length);
  };

}

function openSongContextMenu(event, song) {
  event.preventDefault();
  const menu = document.getElementById('songContextMenu');
  menu.dataset.songId = song.id;
  menu.hidden = false;
  const margin = 8;
  const menuRect = menu.getBoundingClientRect();
  const left = event.clientX + menuRect.width > window.innerWidth - margin
    ? event.clientX - menuRect.width : event.clientX;
  const top = event.clientY + menuRect.height > window.innerHeight - margin
    ? event.clientY - menuRect.height : event.clientY;
  menu.style.left = `${Math.max(margin, left)}px`;
  menu.style.top = `${Math.max(margin, top)}px`;
}

function closeSongContextMenu() {
  document.getElementById('songContextMenu').hidden = true;
}

function highlightScheduleItem(itemId, row) {
  state.scheduleSelectedItemId = itemId;
  document.querySelectorAll('.sched-item').forEach((scheduleRow) => {
    scheduleRow.classList.toggle('active', scheduleRow === row);
  });
}

function displayScheduleItem(itemId) {
  state.scheduleSelectedItemId = itemId;
  state.currentItemId = itemId;
  state.previewItem = null;
  state.selectedItemId = itemId;
  state.selectedSlideId = null;
  const item = state.schedule.find((scheduleItem) => scheduleItem.id === itemId);
  renderSchedule();
  setSlideViewMode(item && item.type === 'song' ? 'sections' : 'grid');
  if (item && item.slides.length) goLiveWithSlide(item, item.slides[0], themeFor(item));
}

function removeScheduleItem(itemId) {
  state.schedule = state.schedule.filter((i) => i.id !== itemId);
  if (state.scheduleSelectedItemId === itemId) state.scheduleSelectedItemId = null;
  if (state.currentItemId === itemId) state.currentItemId = null;
  if (state.liveItemId === itemId) { state.liveItemId = null; state.liveSlideId = null; }
  renderSchedule();
  renderSlideGrid();
}

// ---------------------------------------------------------------------------
// Slide grid (right column) + live control
// ---------------------------------------------------------------------------
function getSectionLabelColor(label) {
  if (!label) return '#9aa0ac';
  const colors = state.settings.sectionLabelColors || {};
  const match = Object.keys(colors).find((customLabel) => (
    new RegExp(`(^|\\s)${customLabel.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?=\\s|$)`).test(label)
  ));
  return match ? colors[match] : '#9aa0ac';
}

function renderPreviewResource(item) {
  const label = document.getElementById('previewResourceLabel');
  const text = document.getElementById('previewResourceText');
  const slide = item && item.slides.find((candidate) => candidate.id === state.selectedSlideId)
    || item && item.slides[0];
  label.textContent = slide ? (slide.label || '') : '';
  label.hidden = !slide || !slide.label;
  label.style.color = getSectionLabelColor(slide && slide.label);
  text.textContent = slide ? (slide.text || (slide.background ? 'Media' : '')) : '';
}

function displaySelectedContent(item, slide, theme) {
  state.screenModes.black = false;
  state.screenModes.clear = false;
  goLiveWithSlide(item, slide, theme);
}

function renderSlideGrid() {
  const grid = document.getElementById('slideGrid');
  const sectionsList = document.getElementById('sectionsList');
  grid.innerHTML = '';
  sectionsList.innerHTML = '';
  const item = state.schedule.find((i) => i.id === state.currentItemId) || state.previewItem;
  grid.style.display = state.slideViewMode === 'grid' ? 'grid' : 'none';
  sectionsList.classList.toggle('active', state.slideViewMode === 'sections');
  renderPreviewResource(item);
  if (!item) return;

  const theme = themeFor(item);
  item.slides.forEach((slide) => {
    const section = document.createElement('div');
    const isSelected = item.id === state.selectedItemId && slide.id === state.selectedSlideId;
    const isLive = state.lastPayload && state.lastPayload.mode === 'slide'
      && item.id === state.liveItemId && slide.id === state.liveSlideId;
    section.className = `section-card${slide.label ? '' : ' no-label'}${isSelected ? ' selected' : ''}${isLive ? ' live' : ''}`;
    section.innerHTML = `${slide.label ? `<div class="section-label">${escapeHtml(slide.label)}</div>` : ''}`
      + `<div class="section-text">${escapeHtml(slide.text || (slide.background ? 'Media' : ''))}</div>`;
    if (slide.label) section.querySelector('.section-label').style.color = getSectionLabelColor(slide.label);
    section.addEventListener('click', () => selectSlide(item, slide));
    section.addEventListener('dblclick', () => displaySelectedContent(item, slide, theme));
    sectionsList.appendChild(section);
  });

  item.slides.forEach((slide) => {
    const card = document.createElement('div');
    const isSelected = item.id === state.selectedItemId && slide.id === state.selectedSlideId;
    const isLive = state.lastPayload && state.lastPayload.mode === 'slide'
      && item.id === state.liveItemId && slide.id === state.liveSlideId;
    card.className = `slide-card${isSelected ? ' selected' : ''}${isLive ? ' live' : ''}`;

    const bg = slide.background || theme.background;
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (bg.type === 'color') {
      thumb.style.background = bg.value;
    } else if (bg.type === 'image') {
      thumb.style.backgroundImage = `url("${bg.value}")`;
      thumb.style.backgroundSize = 'cover';
      thumb.style.backgroundPosition = 'center';
    } else {
      thumb.style.background = '#111';
    }

    if (slide.text) {
      const txt = document.createElement('div');
      txt.className = 'txt';
      txt.textContent = slide.text;
      txt.style.color = theme.font.color;
      txt.style.fontFamily = theme.font.family;
      txt.style.fontWeight = theme.font.weight;
      thumb.appendChild(txt);
    } else if (bg.type === 'video') {
      const lbl = document.createElement('div');
      lbl.className = 'txt';
      lbl.textContent = '🎬 Video';
      lbl.style.color = '#aaa';
      thumb.appendChild(lbl);
    }

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = slide.label;

    card.appendChild(thumb);
    card.appendChild(label);
    card.addEventListener('click', () => selectSlide(item, slide));
    card.addEventListener('dblclick', () => displaySelectedContent(item, slide, theme));
    grid.appendChild(card);
  });
}

function setLibraryPreview(item) {
  if (!item.slides.length) return;
  state.currentItemId = null;
  state.previewItem = item;
  state.selectedItemId = item.id;
  state.selectedSlideId = item.slides[0].id;
  setSlideViewMode('sections');
}

function previewLibrarySong(song) {
  const slides = (Array.isArray(song.slides) ? song.slides : [])
    .map((slide) => ({ id: slide.id || uid(), label: slide.label, text: slide.text }));
  if (!slides.length) return;
  setLibraryPreview({
    id: `library-${song.id}`,
    type: 'song',
    title: song.title,
    themeId: song.themeId || 'default',
    slides,
  });
}

function previewLibraryScripture(book, chapterObj) {
  const perSlide = Math.max(1, parseInt(document.getElementById('versesPerSlide').value, 10) || 1);
  const slides = [];
  for (let i = 0; i < chapterObj.verses.length; i += perSlide) {
    const group = chapterObj.verses.slice(i, i + perSlide);
    slides.push({
      id: uid(),
      label: group.length > 1 ? `v.${group[0].verse}-${group[group.length - 1].verse}` : `v.${group[0].verse}`,
      text: group.map((verse) => `${verse.verse} ${verse.text}`).join('\n'),
    });
  }
  setLibraryPreview({ id: `library-${book}-${chapterObj.chapter}`, type: 'scripture', title: `${book} ${chapterObj.chapter}`, themeId: 'default', slides });
}

function previewLibraryVerse(book, chapterObj, verse) {
  setLibraryPreview({
    id: `library-${book}-${chapterObj.chapter}-${verse.verse}`,
    type: 'scripture',
    title: `${book} ${chapterObj.chapter}:${verse.verse}`,
    themeId: 'default',
    slides: [{ id: uid(), label: `v.${verse.verse}`, text: `${verse.verse} ${verse.text}` }],
  });
}

function displayLibrarySong(song) {
  previewLibrarySong(song);
  if (!state.previewItem) return;
  goLiveWithSlide(state.previewItem, state.previewItem.slides[0], themeFor(state.previewItem));
}

function selectSlide(item, slide) {
  state.selectedItemId = item.id;
  state.selectedSlideId = slide.id;
  goLiveWithSlide(item, slide, themeFor(item));
}

function setSlideViewMode(mode) {
  state.slideViewMode = mode;
  const toggle = document.getElementById('btnViewToggle');
  const showingGrid = mode === 'grid';
  toggle.querySelector('.view-icon').textContent = showingGrid ? '\u2637' : '\u2636';
  toggle.setAttribute('aria-label', showingGrid ? 'Switch to sections view' : 'Switch to grid view');
  toggle.setAttribute('title', showingGrid ? 'Switch to sections view' : 'Switch to grid view');
  toggle.setAttribute('aria-pressed', String(!showingGrid));
  renderSlideGrid();
}

function toggleSlideViewMode() {
  setSlideViewMode(state.slideViewMode === 'grid' ? 'sections' : 'grid');
}

function applyToPreview(payload) {
  window.WorshipRender.applyPayload(payload, document.getElementById('previewInner'), document.getElementById('previewText'));
}

function refreshPreviewLayout() {
  if (state.lastPayload) applyToPreview(state.lastPayload);
}

function updatePreviewAspect(displayId) {
  const display = state.outputDisplays.find((candidate) => String(candidate.id) === String(displayId));
  if (!display || !display.width || !display.height) return;
  document.getElementById('previewBox').style.setProperty(
    '--preview-aspect', `${display.width} / ${display.height}`,
  );
  constrainPreviewWidth();
  refreshPreviewLayout();
}

function pushLive(payload) {
  state.lastPayload = payload;
  window.api.updateLive(payload);
  applyToPreview(payload);
}

function renderResolvedOutput() {
  const payload = resolveOutputPayload();
  pushLive(payload);
  updateScreenModeButtons();
}

function resolveOutputPayload() {
  const modes = state.screenModes;
  let payload = state.lastSlidePayload || { mode: 'black' };
  if (modes.clear) {
    payload = {
      mode: 'clear',
      background: (state.lastSlidePayload && state.lastSlidePayload.background)
        || { type: 'color', value: '#000000' },
    };
  }
  if (modes.black) payload = { mode: 'black' };
  if (modes.logo) payload = { mode: 'logo', logoPath: state.settings.logoPath || null };
  return payload;
}

function updateScreenModeButtons() {
  const modes = { logo: 'btnLogoScreen', black: 'btnBlackScreen', clear: 'btnClearScreen' };
  Object.entries(modes).forEach(([name, id]) => {
    document.getElementById(id).classList.toggle('active', state.screenModes[name]);
  });
}

function updateLiveButton(active) {
  liveOpen = active;
  const button = document.getElementById('btnGoLive');
  button.classList.toggle('live-active', active);
  button.setAttribute('aria-pressed', String(active));
}

async function persistLiveState(active) {
  const selectedDisplayId = document.getElementById('displaySelect').value;
  state.settings.liveOpen = Boolean(active);
  state.settings.liveOnExit = Boolean(active);
  if (selectedDisplayId !== '') state.settings.lastDisplayId = Number(selectedDisplayId);
  await persistSettings();
}

function getSelectedContent() {
  const item = state.schedule.find((candidate) => candidate.id === state.selectedItemId)
    || (state.previewItem && state.previewItem.id === state.selectedItemId ? state.previewItem : null);
  const slide = item && (item.slides.find((candidate) => candidate.id === state.selectedSlideId) || item.slides[0]);
  return item && slide ? { item, slide } : null;
}

function restoreSelectedSlide() {
  const item = state.schedule.find((candidate) => candidate.id === state.selectedItemId)
    || (state.previewItem && state.previewItem.id === state.selectedItemId ? state.previewItem : null);
  const slide = item && (item.slides.find((candidate) => candidate.id === state.selectedSlideId)
    || item.slides[0]);
  if (item && slide) goLiveWithSlide(item, slide, themeFor(item));
  else pushLive({ mode: 'black' });
}

function buildSlidePayload(item, slide, theme) {
  return {
    mode: 'slide',
    text: slide.text || '',
    background: slide.background || theme.background,
    font: theme.font,
    align: theme.align,
    shadow: theme.shadow,
  };
}

function goLiveWithSlide(item, slide, theme) {
  state.selectedItemId = item.id;
  state.selectedSlideId = slide.id;
  state.lastSlideItemId = item.id;
  state.lastSlideId = slide.id;
  state.lastSlidePayload = buildSlidePayload(item, slide, theme);
  if (liveOpen) {
    state.liveItemId = item.id;
    state.liveSlideId = slide.id;
    renderResolvedOutput();
  } else if (state.screenModes.logo) {
    renderResolvedOutput();
  } else {
    state.lastPayload = state.lastSlidePayload;
    applyToPreview(state.lastSlidePayload);
  }
  renderSlideGrid();
}

function flattenSchedule() {
  const flat = [];
  state.schedule.forEach((item) => item.slides.forEach((slide) => flat.push({ item, slide })));
  return flat;
}

function stepLive(dir) {
  const flat = flattenSchedule();
  if (!flat.length) return;
  let idx = flat.findIndex((f) => f.item.id === state.liveItemId && f.slide.id === state.liveSlideId);
  if (idx === -1) idx = dir > 0 ? -1 : 0;
  let next = idx + dir;
  if (next < 0) next = 0;
  if (next >= flat.length) next = flat.length - 1;
  const { item, slide } = flat[next];
  state.currentItemId = item.id;
  renderSchedule();
  setSlideViewMode(item.type === 'song' ? 'sections' : 'grid');
  goLiveWithSlide(item, slide, themeFor(item));
}

// ---------------------------------------------------------------------------
// Song editor modal
// ---------------------------------------------------------------------------
function openSongEditor(songId) {
  document.body.classList.remove('options-active');
  window.api.setSongEditorActive(true);
  state.editingSongId = songId || null;
  const song = songId ? state.songs.find((s) => s.id === songId) : null;
  document.getElementById('songEditorTitle').textContent = song ? 'Edit Song' : 'New Song';
  document.getElementById('songTitleInput').value = song ? song.title : '';
  document.getElementById('songAuthorInput').value = song ? (song.author || '') : '';
  fillThemeSelect(document.getElementById('songThemeSelect'), song ? song.themeId : 'default');
  renderSongSectionsEditor(song ? songSections(song) : [{ label: '', lyrics: '' }]);
  document.body.classList.add('song-editor-active');
}

function renderSongSectionsEditor(sections) {
  const container = document.getElementById('songSectionsEditor');
  container.innerHTML = '';
  sections.forEach((section) => {
    const row = document.createElement('div');
    row.className = 'song-section-editor';
    row.innerHTML = '<div class="section-editor-row">'
      + '<div class="section-editor-textbox" role="group"></div>'
      + '<button class="song-section-remove" type="button" aria-label="Remove section" title="Remove section">&times;</button>'
      + '</div>';
    const textbox = row.querySelector('.section-editor-textbox');
    const label = String(section.label || '');
    const lyrics = String(section.lyrics || '');
    textbox.innerHTML = `<span class="section-label-line" contenteditable="true" spellcheck="false">${escapeHtml(label)}</span><br>`
      + `<span class="section-lyrics-line" contenteditable="true">${escapeHtml(lyrics)}</span>`;
    textbox.dataset.emptyLabel = label ? 'false' : 'true';
    textbox.dataset.emptyLyrics = lyrics ? 'false' : 'true';
    updateSongSectionLabelColor(row);
    textbox.addEventListener('input', () => {
      textbox.dataset.emptyLabel = textbox.querySelector('.section-label-line').textContent.trim() ? 'false' : 'true';
      textbox.dataset.emptyLyrics = textbox.querySelector('.section-lyrics-line').innerText.trim() ? 'false' : 'true';
      updateSongSectionLabelColor(row);
    });
    row.querySelector('.song-section-remove').addEventListener('click', () => {
      row.remove();
      if (!container.children.length) addSongSectionEditor();
    });
    container.appendChild(row);
  });
}

function updateSongSectionLabelColor(row) {
  const textbox = row.querySelector('.section-editor-textbox');
  const labelLine = row.querySelector('.section-label-line');
  const label = labelLine.textContent.trim().split(/\r?\n/)[0];
  labelLine.style.color = getSectionLabelColor(label);
}

function addSongSectionEditor() {
  const container = document.getElementById('songSectionsEditor');
  const sections = [...container.querySelectorAll('.song-section-editor')].map((row) => ({
    label: row.querySelector('.section-editor-textbox').dataset.emptyLabel === 'true'
      ? '' : row.querySelector('.section-label-line').textContent.trim(),
    lyrics: row.querySelector('.section-editor-textbox').dataset.emptyLyrics === 'true'
      ? '' : row.querySelector('.section-lyrics-line').innerText,
  }));
  sections.push({ label: '', lyrics: '' });
  renderSongSectionsEditor(sections);
}

function readSongSectionsEditor() {
  return [...document.querySelectorAll('#songSectionsEditor .song-section-editor')]
    .map((row) => {
      const textbox = row.querySelector('.section-editor-textbox');
      return {
        label: textbox.dataset.emptyLabel === 'true'
          ? '' : textbox.querySelector('.section-label-line').textContent.trim().split(/\r?\n/)[0],
        lyrics: textbox.dataset.emptyLyrics === 'true'
          ? '' : textbox.querySelector('.section-lyrics-line').innerText,
      };
    });
}

function closeSongEditor() {
  document.body.classList.remove('song-editor-active');
  window.api.setSongEditorActive(false);
  state.editingSongId = null;
}

function saveSongFromEditor() {
  const title = document.getElementById('songTitleInput').value.trim();
  if (!title) { setStatus('Song title is required'); return; }
  const author = document.getElementById('songAuthorInput').value.trim();
  const themeId = document.getElementById('songThemeSelect').value;
  const sections = readSongSectionsEditor();
  const slides = sections.map((section) => ({ id: uid(), label: section.label, text: section.lyrics }));
  const savedSections = sections.map((section, index) => ({ ...section, id: slides[index].id }));

  if (state.editingSongId) {
    const idx = state.songs.findIndex((s) => s.id === state.editingSongId);
    if (idx >= 0) state.songs[idx] = { ...state.songs[idx], title, author, themeId, sections: savedSections, slides };
  } else {
    state.songs.push({ id: uid(), title, author, themeId, sections: savedSections, slides });
  }
  persistSongs();
  closeSongEditor();
  renderSongs(document.getElementById('songSearch').value);
  setStatus(`Saved "${title}"`);
}

function deleteSongFromEditor() {
  if (!state.editingSongId) return;
  if (!confirm('Delete this song?')) return;
  state.songs = state.songs.filter((s) => s.id !== state.editingSongId);
  persistSongs();
  closeSongEditor();
  renderSongs();
}

// ---------------------------------------------------------------------------
// Theme editor modal
// ---------------------------------------------------------------------------
function toggleThemeBgRows() {
  const type = document.getElementById('themeBgType').value;
  document.getElementById('themeBgColorRow').style.display = type === 'color' ? 'block' : 'none';
  document.getElementById('themeBgFileRow').style.display = type !== 'color' ? 'block' : 'none';
}

function openThemeEditor(themeId) {
  state.editingThemeId = themeId || null;
  const theme = themeId ? state.themes.find((t) => t.id === themeId) : null;
  document.getElementById('themeEditorTitle').textContent = theme ? 'Edit Theme' : 'New Theme';
  document.getElementById('themeNameInput').value = theme ? theme.name : '';

  pendingThemeBg = theme ? { ...theme.background } : { type: 'color', value: '#000000' };
  document.getElementById('themeBgType').value = pendingThemeBg.type;
  document.getElementById('themeBgColor').value = pendingThemeBg.type === 'color' ? pendingThemeBg.value : '#000000';
  document.getElementById('themeBgFileName').textContent = pendingThemeBg.type !== 'color' ? pendingThemeBg.value : '';
  toggleThemeBgRows();

  document.getElementById('themeFontFamily').value = theme ? theme.font.family : 'Georgia, serif';
  document.getElementById('themeFontSize').value = theme ? theme.font.size : 64;
  document.getElementById('themeFontColor').value = theme ? theme.font.color : '#ffffff';
  document.getElementById('themeFontWeight').value = theme ? String(theme.font.weight) : '700';
  document.getElementById('themeAlign').value = theme ? theme.align : 'middle';
  document.getElementById('themeShadow').checked = theme ? !!theme.shadow : true;
  document.getElementById('btnThemeDelete').style.display = (theme && theme.id !== 'default') ? 'inline-block' : 'none';

  document.getElementById('themeEditorBackdrop').classList.add('open');
}

function closeThemeEditor() {
  document.getElementById('themeEditorBackdrop').classList.remove('open');
  state.editingThemeId = null;
}

function saveThemeFromEditor() {
  const name = document.getElementById('themeNameInput').value.trim();
  if (!name) { setStatus('Theme name is required'); return; }
  const type = document.getElementById('themeBgType').value;
  const background = type === 'color'
    ? { type: 'color', value: document.getElementById('themeBgColor').value }
    : { type, value: pendingThemeBg.value || '' };

  const theme = {
    id: state.editingThemeId || uid(),
    name,
    background,
    font: {
      family: document.getElementById('themeFontFamily').value || 'Georgia, serif',
      size: parseInt(document.getElementById('themeFontSize').value, 10) || 64,
      color: document.getElementById('themeFontColor').value,
      weight: document.getElementById('themeFontWeight').value,
    },
    align: document.getElementById('themeAlign').value,
    shadow: document.getElementById('themeShadow').checked,
  };

  const idx = state.themes.findIndex((t) => t.id === theme.id);
  if (idx >= 0) state.themes[idx] = theme; else state.themes.push(theme);
  persistThemes();
  closeThemeEditor();
  renderThemes();
  renderSlideGrid();
  setStatus(`Saved theme "${name}"`);
}

function deleteThemeFromEditor() {
  if (!state.editingThemeId || state.editingThemeId === 'default') return;
  if (!confirm('Delete this theme? Items using it will fall back to Default.')) return;
  state.themes = state.themes.filter((t) => t.id !== state.editingThemeId);
  persistThemes();
  closeThemeEditor();
  renderThemes();
}

function renderMediaPickerList() {
  const container = document.getElementById('mediaPickerList');
  container.innerHTML = '';
  if (!state.media.length) {
    container.innerHTML = '<div class="group-header">No media yet. Close this and click "+ Media" to add some.</div>';
    return;
  }
  state.media.forEach((m) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `<div class="title">${m.type === 'video' ? '🎬' : '🖼️'} ${escapeHtml(m.name)}</div>`;
    item.addEventListener('click', () => {
      pendingThemeBg = { type: m.type, value: window.api.toFileUrl(m.path) };
      document.getElementById('themeBgType').value = m.type;
      toggleThemeBgRows();
      document.getElementById('themeBgFileName').textContent = m.name;
      document.getElementById('mediaPickerBackdrop').classList.remove('open');
    });
    container.appendChild(item);
  });
}

// ---------------------------------------------------------------------------
// Displays / Go Live
// ---------------------------------------------------------------------------
async function refreshDisplays() {
  const displays = await window.api.listDisplays();
  state.outputDisplays = displays;
  const sel = document.getElementById('displaySelect');
  sel.innerHTML = '';
  displays.forEach((d, index) => {
    const o = document.createElement('option');
    o.value = d.id;
    const displayName = d.label || `Display ${index + 1}`;
    const role = d.internal ? 'Built-in' : d.isPrimary ? 'Primary' : 'External';
    o.textContent = `${displayName} — ${role} — ${d.width}x${d.height}`;
    o.title = `${displayName}\n${d.width}x${d.height}\nPosition: ${d.bounds.x}, ${d.bounds.y}`;
    sel.appendChild(o);
  });
  const savedDisplayId = state.settings.lastDisplayId;
  const savedDisplay = displays.find((d) => String(d.id) === String(savedDisplayId));
  const nonPrimary = displays.find((d) => !d.isPrimary);
  if (savedDisplay) sel.value = String(savedDisplay.id);
  else if (nonPrimary) sel.value = String(nonPrimary.id);
  else if (displays[0]) sel.value = String(displays[0].id);
  updatePreviewAspect(sel.value);
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
    updateContentAction(tab.dataset.tab);
  });
});

function updateContentAction(tabName) {
  const button = document.getElementById('btnContentAdd');
  const labels = {
    songs: 'New song',
    scripture: 'Import Bible JSON',
    presentations: 'Import Bible JSON',
    media: 'Add media',
    themes: 'New theme',
  };
  const label = labels[tabName] || labels.songs;
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
}

document.getElementById('songSearch').addEventListener('input', (e) => renderSongs(e.target.value));
document.getElementById('songFilterField').addEventListener('change', () => {
  renderSongs(document.getElementById('songSearch').value);
});
document.getElementById('scriptureSearch').addEventListener('input', (e) => renderScripture(e.target.value));
document.getElementById('scriptureFilterField').addEventListener('change', () => {
  renderScripture(document.getElementById('scriptureSearch').value);
});
document.getElementById('presentationSearch').addEventListener('input', (e) => {
  renderScripture(e.target.value, 'presentation');
});
document.getElementById('presentationFilterField').addEventListener('change', () => {
  renderScripture(document.getElementById('presentationSearch').value, 'presentation');
});
document.getElementById('mediaSearch').addEventListener('input', (e) => renderMedia(e.target.value));
document.getElementById('mediaFilterField').addEventListener('change', () => {
  renderMedia(document.getElementById('mediaSearch').value);
});
document.getElementById('themeSearch').addEventListener('input', (e) => renderThemes(e.target.value));
document.getElementById('themeFilterField').addEventListener('change', () => {
  renderThemes(document.getElementById('themeSearch').value);
});

document.getElementById('btnContextAddSong').addEventListener('click', () => {
  const menu = document.getElementById('songContextMenu');
  const song = state.songs.find((candidate) => candidate.id === menu.dataset.songId);
  if (song) addSongToSchedule(song);
  closeSongContextMenu();
});
document.getElementById('btnContextEditSong').addEventListener('click', () => {
  const menu = document.getElementById('songContextMenu');
  const song = state.songs.find((candidate) => candidate.id === menu.dataset.songId);
  if (song) openSongEditor(song.id);
  closeSongContextMenu();
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('#songContextMenu')) closeSongContextMenu();
});

window.api.onThemeChanged((isLight) => {
  state.settings.themeMode = isLight ? 'light' : 'dark';
  applyThemeMode();
  updateControlOptionsTheme(isLight);
});

function updateControlOptionsTheme(isLight) {
  const icon = document.getElementById('controlThemeIcon');
  const label = document.getElementById('controlThemeLabel');
  const toggle = document.getElementById('controlThemeToggle');
  if (!icon || !label || !toggle) return;
  icon.textContent = isLight ? '\u263e' : '\u263c';
  label.textContent = isLight ? 'Light mode' : 'Dark mode';
  const nextMode = isLight ? 'dark' : 'light';
  toggle.setAttribute('aria-label', `Switch to ${nextMode} mode`);
  toggle.setAttribute('title', `Switch to ${nextMode} mode`);
  toggle.setAttribute('aria-pressed', String(isLight));
  updateSectionLabelColorOutlines();
}

function updateControlOptionsLogo(logoPath) {
  const label = document.getElementById('controlLogoLabel');
  const preview = document.getElementById('controlLogoPreview');
  const clear = document.getElementById('controlLogoClear');
  if (!label || !clear) return;
  label.textContent = logoPath ? logoPath.split(/[\\/]/).pop() : 'No logo selected';
  if (preview) {
    preview.src = logoPath || '';
    preview.hidden = !logoPath;
    preview.alt = logoPath ? 'Selected logo preview' : '';
  }
  clear.hidden = !logoPath;
}

function renderSectionLabelColors() {
  const container = document.getElementById('sectionLabelList');
  const colors = state.settings.sectionLabelColors || {};
  container.innerHTML = '';
  Object.entries(colors).forEach(([label, color]) => {
    let currentLabel = label;
    const row = document.createElement('div');
    row.className = 'label-color-row';
    row.innerHTML = `<input class="label-name-input" type="text" value="${escapeHtml(label)}" pattern="[A-Za-z][A-Za-z0-9]*" maxlength="32" aria-label="Section label name" />`
      + `<input class="color-option label-color-input" type="color" value="${escapeHtml(color)}" aria-label="Color for ${escapeHtml(label)}" />`
      + '<button class="logo-clear" type="button" aria-label="Remove label color" title="Remove label color">&times;</button>';
    const nameInput = row.querySelector('.label-name-input');
    const colorInput = row.querySelector('.label-color-input');
    let colorBeforeChange = colorInput.value;
    updateColorContrastOutline(colorInput);
    const commitName = () => {
      const nextLabel = nameInput.value.trim();
      const isDuplicate = nextLabel !== label
        && Object.prototype.hasOwnProperty.call(state.settings.sectionLabelColors, nextLabel);
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(nextLabel) || isDuplicate) {
        nameInput.value = label;
        nameInput.setCustomValidity(isDuplicate ? 'That label already exists.' : 'Use letters and numbers only, starting with a letter.');
        nameInput.reportValidity();
        return;
      }
      nameInput.setCustomValidity('');
      if (nextLabel !== label) {
        state.settings.sectionLabelColors[nextLabel] = state.settings.sectionLabelColors[currentLabel];
        delete state.settings.sectionLabelColors[currentLabel];
        currentLabel = nextLabel;
        persistSettings();
        renderSectionLabelColors();
      }
      renderSlideGrid();
    };
    nameInput.addEventListener('change', commitName);
    nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        nameInput.blur();
      }
    });
    colorInput.addEventListener('focus', () => {
      colorBeforeChange = colorInput.value;
    });
    colorInput.addEventListener('input', (event) => {
      state.settings.sectionLabelColors[currentLabel] = event.target.value;
      updateColorContrastOutline(colorInput);
      persistSettings();
      renderSlideGrid();
    });
    colorInput.addEventListener('change', (event) => {
      recordSectionLabelColorChange(currentLabel, colorBeforeChange, event.target.value);
      colorBeforeChange = event.target.value;
    });
    row.querySelector('.logo-clear').addEventListener('click', () => {
      delete state.settings.sectionLabelColors[currentLabel];
      persistSettings();
      renderSectionLabelColors();
      renderSlideGrid();
    });
    container.appendChild(row);
  });
}

function openOptionsView() {
  document.body.classList.remove('song-editor-active');
  state.editingSongId = null;
  document.body.classList.add('options-active');
  updateControlOptionsTheme(state.settings.themeMode === 'light');
  updateControlOptionsLogo(state.settings.logoPath);
  renderSectionLabelColors();
}

function closeOptionsView() {
  document.body.classList.remove('options-active');
}

document.getElementById('btnSongCancel').addEventListener('click', closeSongEditor);
document.getElementById('btnSongSave').addEventListener('click', saveSongFromEditor);
document.getElementById('btnAddSongSection').addEventListener('click', addSongSectionEditor);
document.getElementById('btnViewToggle').addEventListener('click', toggleSlideViewMode);
document.getElementById('btnOptionsBack').addEventListener('click', closeOptionsView);
window.api.onEditAction((action) => {
  const activeColorInput = document.activeElement?.matches?.('input[type="color"]');
  const handled = action === 'undo'
    ? undoSectionLabelColor()
    : action === 'redo' ? redoSectionLabelColor() : false;
  if (!handled && !activeColorInput) document.execCommand(action);
});
document.getElementById('controlThemeToggle').addEventListener('click', async () => {
  const isLight = state.settings.themeMode !== 'light';
  await window.api.setThemeMode(isLight);
  state.settings.themeMode = isLight ? 'light' : 'dark';
  applyThemeMode();
  updateControlOptionsTheme(isLight);
});
document.getElementById('controlLogoChoose').addEventListener('click', async () => {
  const path = await window.api.pickLogo();
  if (!path) return;
  const logoPath = window.api.toFileUrl(path);
  await window.api.setLogo(logoPath);
  updateControlOptionsLogo(logoPath);
});
document.getElementById('controlLogoClear').addEventListener('click', async () => {
  await window.api.clearLogo();
  updateControlOptionsLogo(null);
});
document.getElementById('sectionLabelAdd').addEventListener('click', () => {
  const nameInput = document.getElementById('sectionLabelName');
  const name = nameInput.value.trim();
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
    nameInput.setCustomValidity('Use letters and numbers only, starting with a letter.');
    nameInput.reportValidity();
    return;
  }
  if (Object.prototype.hasOwnProperty.call(state.settings.sectionLabelColors || {}, name)) {
    nameInput.setCustomValidity('That label already exists.');
    nameInput.reportValidity();
    return;
  }
  nameInput.setCustomValidity('');
  state.settings.sectionLabelColors = state.settings.sectionLabelColors || {};
  state.settings.sectionLabelColors[name] = document.getElementById('sectionLabelColor').value;
  persistSettings();
  nameInput.value = '';
  renderSectionLabelColors();
  renderSlideGrid();
});
document.getElementById('sectionLabelColor').addEventListener('input', (event) => {
  updateColorContrastOutline(event.target);
});

document.getElementById('btnThemeCancel').addEventListener('click', closeThemeEditor);
document.getElementById('btnThemeSave').addEventListener('click', saveThemeFromEditor);
document.getElementById('btnThemeDelete').addEventListener('click', deleteThemeFromEditor);
document.getElementById('themeBgType').addEventListener('change', toggleThemeBgRows);
document.getElementById('btnThemeBgPick').addEventListener('click', () => {
  renderMediaPickerList();
  document.getElementById('mediaPickerBackdrop').classList.add('open');
});
document.getElementById('btnMediaPickerCancel').addEventListener('click', () => {
  document.getElementById('mediaPickerBackdrop').classList.remove('open');
});

async function addMediaFromPicker() {
  const paths = await window.api.pickMedia();
  if (!paths || !paths.length) return;
  paths.forEach((p) => {
    const ext = (p.split('.').pop() || '').toLowerCase();
    const type = ['mp4', 'webm', 'ogv', 'mov'].includes(ext) ? 'video' : 'image';
    state.media.push({ id: uid(), path: p, name: p.split(/[\\/]/).pop(), type });
  });
  persistMedia();
  renderMedia();
  setStatus(`Added ${paths.length} media file(s)`);
}

async function importBible() {
  const data = await window.api.importJSON('Import Bible (JSON)');
  if (data && Array.isArray(data.books)) {
    state.scripture = data;
    await window.api.saveData('scripture.json', state.scripture);
    renderScripture(document.getElementById('scriptureSearch').value);
    renderScripture(document.getElementById('presentationSearch').value, 'presentation');
    setStatus(`Loaded "${data.translation || 'scripture'}"`);
  } else if (data) {
    setStatus('That file does not match the expected Bible JSON format — see README');
  }
}

document.getElementById('btnContentAdd').addEventListener('click', () => {
  const activeTab = document.querySelector('.tab.active').dataset.tab;
  if (activeTab === 'songs') openSongEditor(null);
  else if (activeTab === 'scripture' || activeTab === 'presentations') importBible();
  else if (activeTab === 'media') addMediaFromPicker();
  else if (activeTab === 'themes') openThemeEditor(null);
});
updateContentAction('songs');

async function openSchedule() {
  const data = await window.api.importJSON('Open schedule');
  if (Array.isArray(data)) {
    state.schedule = data;
    state.currentItemId = null; state.liveItemId = null; state.liveSlideId = null;
    renderSchedule(); renderSlideGrid();
    setStatus('Schedule loaded');
  } else if (data) setStatus('That file does not look like a schedule');
}
async function saveSchedule() {
  const ok = await window.api.exportJSON({ title: 'Save schedule', defaultName: 'schedule.json', data: state.schedule });
  if (ok) setStatus('Schedule saved');
}
function clearSchedule() {
  if (!state.schedule.length || !confirm('Clear the entire schedule?')) return;
  state.schedule = [];
  state.currentItemId = null; state.liveItemId = null; state.liveSlideId = null;
  renderSchedule(); renderSlideGrid();
}
window.api.onFileAction((action) => {
  if (action === 'new-schedule') clearSchedule();
  else if (action === 'new-song') openSongEditor(null);
  else if (action === 'new-presentation') {
    document.querySelector('.tab[data-tab="presentations"]').click();
  }
  else if (action === 'open-schedule') openSchedule();
  else if (action === 'save-schedule') saveSchedule();
  else if (action === 'open-options') openOptionsView();
});
window.api.onViewAction((view) => applyWorkspaceView(view));
window.api.onProfileAction((action) => {
  if (action === 'reset-song-themes') {
    state.songs = state.songs.map((song) => ({ ...song, themeId: 'default' }));
    persistSongs();
    renderSongs(document.getElementById('songSearch').value);
  } else if (action === 'rebuild-search-keys') {
    state.songs = state.songs.map((song) => ({
      ...song,
      searchKey: `${song.title || ''} ${song.author || ''}`.toLowerCase().trim(),
    }));
    persistSongs();
  }
});
document.getElementById('btnGoLive').addEventListener('click', async () => {
  // Ask the main process for the authoritative window state so the button
  // cannot disagree with an output window restored during startup.
  const actualOpen = await window.api.isLiveOpen();
  liveOpen = actualOpen;

  if (!actualOpen) {
    const selected = getSelectedContent();
    const initialPayload = resolveOutputPayload();
    await window.api.openLive(initialPayload);
    const displayId = parseInt(document.getElementById('displaySelect').value, 10);
    if (!Number.isNaN(displayId)) await window.api.setLiveDisplay(displayId);
    updateLiveButton(true);
    await persistLiveState(true);

    if (selected) {
      goLiveWithSlide(selected.item, selected.slide, themeFor(selected.item));
    } else {
      pushLive(initialPayload);
      updateScreenModeButtons();
      renderSlideGrid();
    }
  } else {
    await window.api.closeLive();
    updateLiveButton(false);
    await persistLiveState(false);
  }
});

document.getElementById('displaySelect').addEventListener('change', async (e) => {
  updatePreviewAspect(e.target.value);
  const displayId = parseInt(e.target.value, 10);
  if (Number.isNaN(displayId)) return;

  state.settings.lastDisplayId = displayId;
  await persistSettings();

  if (liveOpen) await window.api.setLiveDisplay(displayId);
});

window.addEventListener('resize', () => {
  constrainScheduleWidth();
  constrainPreviewWidth();
  constrainContentHubHeight();
  syncCombinedPreview();
});

document.getElementById('btnBlackScreen').addEventListener('click', () => {
  state.screenModes.black = !state.screenModes.black;
  renderResolvedOutput();
  renderSlideGrid();
});
document.getElementById('btnClearScreen').addEventListener('click', () => {
  state.screenModes.clear = !state.screenModes.clear;
  renderResolvedOutput();
});
document.getElementById('btnLogoScreen').addEventListener('click', async () => {
  state.screenModes.logo = !state.screenModes.logo;
  renderResolvedOutput();
});
window.api.onLogoChanged((logoPath) => {
  state.settings.logoPath = logoPath;
  updateControlOptionsLogo(logoPath);
  if (state.screenModes.logo) renderResolvedOutput();
});

document.addEventListener('keydown', (e) => {
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); stepLive(1); }
  else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); stepLive(-1); }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
async function init() {
  const [songs, scripture, media, themes, settings] = await Promise.all([
    window.api.getData('library.json'),
    window.api.getData('scripture.json'),
    window.api.getData('media.json'),
    window.api.getData('themes.json'),
    window.api.getData('settings.json'),
  ]);
  state.songs = (Array.isArray(songs) ? songs : []).map(normalizeSong);
  state.scripture = scripture || null;
  state.media = media || [];
  state.themes = (themes && themes.length) ? themes : [defaultThemeClient()];
  state.settings = settings && !Array.isArray(settings) ? settings : {};
  state.settings.liveOpen = Boolean(state.settings.liveOpen ?? state.settings.liveOnExit);
  state.settings.liveOnExit = state.settings.liveOpen;

  applyThemeMode();
  setupPanelResize();
  applyWorkspaceView(state.settings.viewMode || 'live-resource');
  renderSongs();
  renderScripture();
  renderScripture('', 'presentation');
  renderMedia();
  renderThemes();
  renderSchedule();
  await refreshDisplays();
  renderSlideGrid();
  state.lastPayload = { mode: 'black' };
  applyToPreview({ mode: 'black' });
  updateScreenModeButtons();

  // The main process is authoritative for whether the output window exists.
  // If the app was closed while Live, the restored output is deliberately black.
  let liveState = await window.api.getLiveState();
  if (liveState.liveOpen && !liveState.open) {
    await window.api.restoreSavedLive();
    liveState = await window.api.getLiveState();
  }
  updateLiveButton(Boolean(liveState.open));

  setStatus('Ready');
}

window.api.onLiveStateChanged((liveState) => {
  updateLiveButton(Boolean(liveState?.open));
  if (liveState?.restoring && liveState?.open) {
    state.lastPayload = { mode: 'black' };
    state.lastSlidePayload = null;
    state.liveItemId = null;
    state.liveSlideId = null;
    state.screenModes = { logo: false, black: false, clear: false };
    applyToPreview({ mode: 'black' });
    updateScreenModeButtons();
    renderSlideGrid();
  }
});

init();
