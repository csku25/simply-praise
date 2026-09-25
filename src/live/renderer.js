const stage = document.getElementById('stage');
const stageText = document.getElementById('stageText');

// Start black until the control window sends the first real payload.
window.WorshipRender.applyPayload({ mode: 'black' }, stage, stageText);

window.api.onSlideUpdate((payload) => {
  window.WorshipRender.applyPayload(payload, stage, stageText);
});

// Re-apply the last known payload on resize (e.g. when moved to a different
// display) so font scaling recalculates against the new window width.
let lastPayload = { mode: 'black' };
const originalApply = window.WorshipRender.applyPayload;
window.WorshipRender.applyPayload = function (payload, containerEl, textEl) {
  lastPayload = payload;
  originalApply(payload, containerEl, textEl);
};
window.addEventListener('resize', () => {
  originalApply(lastPayload, stage, stageText);
});
