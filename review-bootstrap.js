// public/method/review-bootstrap.js
//
// Composed 2026-05-10 from library/features/review-widget/.
// Re-composed 2026-05-13 for the inert-entry-button atomic.
// See .composition-manifest.md alongside this file for full provenance.
//
// Loaded on every page. Two responsibilities:
//
//   1. ALWAYS — injects a floating entry button (bottom-right) per
//      library/features/review-widget/inert-entry-button.md. Clicking
//      it sets ?review=1 and hard-reloads, triggering (2) below.
//
//   2. WHEN ?review=1 — dynamically loads review-mode.css and
//      review-mode.js, sets data-review-mode="on", and hands off to
//      the widget module. The entry button is hidden in this state;
//      the banner's Exit affordance handles the reverse transition.
//
// Self-locating: derives its own URL via document.currentScript so
// review-mode.css and review-mode.js are loaded from the same folder,
// regardless of whether the site serves at the github.io sub-path or
// the canonical CNAME root.
//
// Source-of-truth: do NOT hand-edit. Re-compose via the library.

(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var reviewActive = params.get('review') === '1';

  // ----- (1) Inert-page entry button per inert-entry-button.md -----
  // Injected on the inert path only — the function early-exits when
  // review is already active. Token-resolved colors are pinned here as
  // literals (glinda's brand-token values):
  //   background       primary-deep      #8705E4
  //   color            surface-base      #FFFFFF
  //   hover background primary-darker    #6804B5
  //   shadow tint      surface-overlay   rgba(1, 5, 94, 0.18) / 0.22
  // If brand/design-tokens/ values change, re-compose this block.
  function injectEntryButton() {
    if (reviewActive) return;

    var style = document.createElement('style');
    style.textContent = [
      '.review-toggle-btn {',
      '  position: fixed;',
      '  bottom: 20px;',
      '  right: 20px;',
      '  z-index: 9990;',
      '  background: #8705E4;',
      '  color: #FFFFFF;',
      '  border: none;',
      '  padding: 12px 20px;',
      '  border-radius: 999px;',
      '  cursor: pointer;',
      '  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;',
      '  font-size: 13px;',
      '  font-weight: 600;',
      '  letter-spacing: 0.04em;',
      '  box-shadow: 0 4px 14px rgba(1, 5, 94, 0.18);',
      '  transition: transform .15s, box-shadow .15s, background .15s;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 8px;',
      '}',
      '.review-toggle-btn:hover {',
      '  transform: translateY(-1px);',
      '  background: #6804B5;',
      '  box-shadow: 0 6px 20px rgba(1, 5, 94, 0.22);',
      '}',
      '.review-toggle-btn:active {',
      '  transform: translateY(0);',
      '}',
      '@media print {',
      '  .review-toggle-btn { display: none; }',
      '}'
    ].join('\n');
    document.head.appendChild(style);

    var cfg = window.GLINDA_CONTACT_CONFIG || {};
    var labels = (cfg && cfg.REVIEW_LABELS) || {};

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'review-toggle-btn';
    btn.setAttribute('data-review-skip', '');
    btn.textContent = labels.toggleButton || 'Comments';
    btn.title = labels.toggleButtonTitle || 'Open comment review mode';
    btn.addEventListener('click', function () {
      var url = new URL(window.location.href);
      url.searchParams.set('review', '1');
      window.location.href = url.toString();
    });
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectEntryButton);
  } else {
    injectEntryButton();
  }

  // ----- (2) Widget activation (only when ?review=1) -----
  if (!reviewActive) {
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
