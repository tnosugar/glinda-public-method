// public/method/review-bootstrap.js
//
// Composed 2026-05-10 from library/features/review-widget/.
// See .composition-manifest.md alongside this file for full provenance.
//
// Inert-by-default loader. Reads window.location.search for ?review=1.
// If present, dynamically loads review-mode.css + review-mode.js, then
// hands off to the module. If absent, this file does nothing — no CSS
// loaded, no module loaded, no RTDB connection.
//
// Self-locating: derives its own URL via document.currentScript so that
// review-mode.css and review-mode.js are loaded from the same folder,
// regardless of whether the site serves at the github.io sub-path or
// the canonical CNAME root.
//
// Source-of-truth: do NOT hand-edit. Re-compose via the library.

(function () {
  'use strict';

  // Soft gate. Default (no flag) → return immediately.
  var params = new URLSearchParams(window.location.search);
  if (params.get('review') !== '1') {
    return;
  }

  // Self-locating: figure out where this script lives so we can load
  // siblings relative to it. document.currentScript is reliable in this
  // synchronous top-level inline context.
  var scriptEl = document.currentScript;
  var basePath = '';
  if (scriptEl && scriptEl.src) {
    basePath = scriptEl.src.replace(/[^/]*$/, '');
  }

  function reviewFailed(reason, errorMessage) {
    try {
      window.dispatchEvent(new CustomEvent('review.failed', {
        detail: {
          pageSlug: derivePageSlug(),
          failedAt: Date.now(),
          reason: reason,
          errorMessage: errorMessage || '',
          recoverableHint: hintFor(reason)
        }
      }));
    } catch (_) { /* silent */ }
  }

  function hintFor(reason) {
    if (reason === 'config-missing') {
      return 'Check that contact-form.config.js is loaded BEFORE review-bootstrap.js and that window.GLINDA_CONTACT_CONFIG is defined.';
    }
    if (reason === 'module-load-error') {
      return 'Check the network panel for review-mode.js — likely a 404 or sub-path mismatch.';
    }
    if (reason === 'css-load-error') {
      return 'Check the network panel for review-mode.css — likely a 404 or sub-path mismatch.';
    }
    return '';
  }

  function derivePageSlug() {
    var path = window.location.pathname || '/';
    path = path.replace(/\/index\.html?$/i, '');
    if (path === '' || path === '/') return 'home';
    path = path.replace(/^\/+|\/+$/g, '');
    return path.replace(/\//g, '-');
  }

  // Config-missing fast-fail. The widget needs window.GLINDA_CONTACT_CONFIG
  // (or its REVIEW_LABELS at minimum) before init. If it isn't there, the
  // bootstrap aborts cleanly and emits review.failed.
  if (!window.GLINDA_CONTACT_CONFIG) {
    reviewFailed('config-missing', 'window.GLINDA_CONTACT_CONFIG is undefined.');
    return;
  }

  // Load CSS first, then the module. We don't strictly need to await
  // the stylesheet, but the module's first render is smoother if CSS
  // arrives first; on slow networks the difference is visible.
  function loadCss() {
    return new Promise(function (resolve, reject) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = basePath + 'review-mode.css';
      link.onload = function () { resolve(); };
      link.onerror = function () { reject(new Error('css-load-error')); };
      document.head.appendChild(link);
    });
  }

  function loadModule() {
    return import(basePath + 'review-mode.js');
  }

  // Flip the activation attribute. The CSS is scoped to
  // [data-review-mode="on"] so styles only apply once this is set.
  function activate() {
    document.documentElement.setAttribute('data-review-mode', 'on');
  }

  loadCss()
    .then(function () {
      activate();
      return loadModule();
    })
    .then(function (mod) {
      if (typeof mod.init === 'function') {
        return mod.init({
          basePath: basePath,
          config: window.GLINDA_CONTACT_CONFIG,
          configGlobalName: 'GLINDA_CONTACT_CONFIG'
        });
      }
    })
    .catch(function (err) {
      var reason = (err && err.message === 'css-load-error') ? 'css-load-error' : 'module-load-error';
      reviewFailed(reason, err && err.message ? err.message : String(err));
    });

})();
