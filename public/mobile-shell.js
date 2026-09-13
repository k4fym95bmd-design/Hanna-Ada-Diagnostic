const menuButton = document.getElementById('mobileMenuButton');
const overlay = document.getElementById('navOverlay');
const closeNav = () => {
  document.body.classList.remove('nav-open');
  menuButton?.setAttribute('aria-expanded', 'false');
};
const openNav = () => {
  document.body.classList.add('nav-open');
  menuButton?.setAttribute('aria-expanded', 'true');
};

menuButton?.addEventListener('click', () => {
  document.body.classList.contains('nav-open') ? closeNav() : openNav();
});
overlay?.addEventListener('click', closeNav);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeNav();
});
document.getElementById('nav')?.addEventListener('click', event => {
  if (event.target.closest('.nav-button')) closeNav();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
