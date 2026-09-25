const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');
const themeLabel = document.getElementById('themeLabel');
const logoLabel = document.getElementById('logoLabel');
const logoChoose = document.getElementById('logoChoose');
const logoClear = document.getElementById('logoClear');

function applyThemeMode(isLight) {
  document.body.classList.toggle('light-mode', isLight);
  themeIcon.textContent = isLight ? '\u263e' : '\u263c';
  themeLabel.textContent = isLight ? 'Light mode' : 'Dark mode';
  const nextMode = isLight ? 'dark' : 'light';
  themeToggle.setAttribute('aria-label', `Switch to ${nextMode}`);
  themeToggle.setAttribute('title', `Switch to ${nextMode}`);
  themeToggle.setAttribute('aria-pressed', String(isLight));
}

themeToggle.addEventListener('click', async () => {
  const settings = await window.api.getData('settings.json');
  const isLight = settings.themeMode !== 'light';
  await window.api.setThemeMode(isLight);
  applyThemeMode(isLight);
});

window.api.getData('settings.json').then((settings) => {
  applyThemeMode(settings.themeMode === 'light');
  updateLogo(settings.logoPath);
});
window.api.onThemeChanged(applyThemeMode);

function updateLogo(logoPath) {
  logoLabel.textContent = logoPath ? logoPath.split(/[\\/]/).pop() : 'No logo selected';
  logoClear.hidden = !logoPath;
}

logoChoose.addEventListener('click', async () => {
  const path = await window.api.pickLogo();
  if (!path) return;
  const logoPath = window.api.toFileUrl(path);
  await window.api.setLogo(logoPath);
  updateLogo(logoPath);
});
logoClear.addEventListener('click', async () => {
  await window.api.clearLogo();
  updateLogo(null);
});
window.api.onLogoChanged(updateLogo);
