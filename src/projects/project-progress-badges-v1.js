// Performance-safe placeholder for Works progress badges.
// The previous implementation repeatedly read workspace.json and coordinated multiple
// DOM observers. That work is intentionally disabled while the progress summary is
// moved into the core project model in a later refactor.
(function () {
  function removeLegacyProgressUi() {
    document.querySelectorAll('.project-progress-badges').forEach(node => node.remove());
    document.querySelectorAll('.project-library-card.has-published-progress').forEach(card => {
      card.classList.remove('has-published-progress');
    });
  }

  // Run only on explicit app lifecycle events. No MutationObserver, no IndexedDB reads,
  // no File System Access reads, and no custom event feedback loop.
  window.addEventListener('storyflow:projects-changed', removeLegacyProgressUi);
  window.addEventListener('storyflow:view-changed', removeLegacyProgressUi);
  window.addEventListener('load', removeLegacyProgressUi, { once: true });
  removeLegacyProgressUi();
})();
