// public/method/book-a-call-modal.js
//
// Drop-in script. Each production page loads it. On DOM ready it intercepts
// clicks on every element with data-cta="nav-book" / "primary-footer" /
// "primary-hero" whose text mentions "book" or "call", and opens a Calendly
// booking modal in place — no page navigation, no /book-a-call/ round-trip.
//
// Closing the modal (X button, Escape, backdrop click) just hides it. The
// underlying page is unchanged: same scroll position, same form state, same
// reading context.
//
// The standalone /book-a-call/ page still exists for direct URL access /
// bookmarks / email signatures.

(function () {
  if (window.__GLINDA_BOOK_MODAL__) return;
  window.__GLINDA_BOOK_MODAL__ = true;

  // === Self-locate to resolve /files/logo.svg relative to wherever this
  //     script was loaded from. Mirrors the auth-gate.js pattern. ===
  var SCRIPT_URL = (function () {
    if (document.currentScript && document.currentScript.src) {
      return document.currentScript.src;
    }
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && scripts[i].src.indexOf('book-a-call-modal.js') >= 0) {
        return scripts[i].src;
      }
    }
    return null;
  })();
  var BASE = SCRIPT_URL ? SCRIPT_URL.replace(/book-a-call-modal\.js.*$/, '') : './';

  // === Calendly config ===
  var CALENDLY_URL = 'https://calendly.com/d/dzzp-tx7-qp3/see-what-s-possible-with-glinda';
  var CALENDLY_PARAMS = {
    primary_color:            '8705e4',
    text_color:               '01055e',
    background_color:         'ffffff',
    hide_landing_page_details: '1',
    hide_gdpr_banner:          '1'
  };
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  // === CSS (injected on first open) ===
  var CSS = ''
    + '.gg-modal-overlay {'
    + '  position: fixed; inset: 0;'
    + '  background: #fff;'           /* full-screen modal — no backdrop */
    + '  z-index: 9000;'
    + '  opacity: 0; pointer-events: none;'
    + '  transition: opacity 0.22s cubic-bezier(0.2, 0.7, 0.2, 1);'
    + '  display: flex; align-items: stretch; justify-content: stretch;'
    + '  padding: 0;'
    + '}'
    + '.gg-modal-overlay.open { opacity: 1; pointer-events: auto; }'
    + '.gg-modal-card {'
    + '  background: #fff;'
    + '  width: 100%;'                /* edge-to-edge */
    + '  max-width: none;'
    + '  border-radius: 0;'
    + '  box-shadow: none;'
    + '  display: flex; flex-direction: column;'
    + '  overflow: hidden;'
    + '}'
    + '.gg-modal-header {'
    + '  flex: 0 0 auto;'
    + '  display: flex; align-items: center; justify-content: flex-start;'
    + '  padding: 0.85rem 1.25rem;'
    + '  border-bottom: 1px solid #CDDCDF;'
    + '  position: relative; z-index: 3;'
    + '  background: #fff;'
    + '}'
    + '.gg-modal-brand img { height: 36px; width: auto; display: block; }'
    /* Close button — fixed-position OUTSIDE the modal card, top-right of
       the overlay. Calendly's iframe cannot reach this stacking context
       and its own back/close affordances render inside the iframe far
       below this point. */
    + '.gg-modal-close {'
    + '  position: fixed;'
    + '  top: 1.1rem; right: 1.1rem;'
    + '  width: 44px; height: 44px; border-radius: 50%;'
    + '  background: #fff;'
    + '  border: 0;'
    + '  box-shadow: 0 6px 18px rgba(0,0,0,0.30), 0 0 0 1px rgba(0,0,0,0.05);'
    + '  z-index: 10001;'
    + '  display: flex; align-items: center; justify-content: center;'
    + '  cursor: pointer; color: #41505A;'
    + '  transition: transform 0.15s, background 0.15s, color 0.15s;'
    + '  padding: 0;'
    + '  -webkit-tap-highlight-color: transparent;'
    + '}'
    + '.gg-modal-close:hover { background: #8705E4; color: #fff; transform: scale(1.06); }'
    + '.gg-modal-close:focus-visible { outline: 2px solid #8705E4; outline-offset: 3px; }'
    + '.gg-modal-close svg { width: 22px; height: 22px; fill: currentColor; pointer-events: none; }'
    + '.gg-modal-intro {'
    + '  flex: 0 0 auto;'
    + "  font-family: 'Open Sans', system-ui, sans-serif;"
    + '  padding: 0.85rem 1.5rem;'
    + '  text-align: center;'
    + '  font-size: 0.95rem; line-height: 1.5;'
    + '  color: #41505A;'
    + '  border-bottom: 1px solid #CDDCDF;'
    + '  margin: 0;'
    + '}'
    + '.gg-modal-intro strong { color: #8705E4; font-weight: 600; }'
    + '.gg-modal-body {'
    + '  flex: 1 1 auto;'
    + '  min-height: 0;'
    + '  padding: 0.5rem 1rem 0.75rem;'
    + '  display: flex;'
    + '  overflow: hidden;'
    + '}'
    + '.gg-modal-body .calendly-inline-widget {'
    + '  width: 100%;'
    + '  flex: 1 1 auto;'
    + '  min-width: 320px;'
    + '  border-radius: 8px;'
    + '  overflow: hidden;'
    + '}'
    + '@media (max-width: 640px) {'
    + '  .gg-modal-header { padding: 0.55rem 0.85rem; }'
    + '  .gg-modal-brand img { height: 28px; }'
    + '  .gg-modal-intro { padding: 0.6rem 0.85rem; font-size: 0.88rem; }'
    + '  .gg-modal-body { padding: 0.35rem 0.5rem; }'
    + '  .gg-modal-close { top: 0.75rem; right: 0.75rem; }'
    + '}';

  function injectStyles() {
    if (document.getElementById('gg-modal-styles')) return;
    var style = document.createElement('style');
    style.id = 'gg-modal-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // === Build Calendly URL with brand params + inbound UTMs ===
  function buildCalendlyUrl() {
    var all = {};
    Object.keys(CALENDLY_PARAMS).forEach(function (k) { all[k] = CALENDLY_PARAMS[k]; });

    var params = new URLSearchParams(window.location.search);
    UTM_KEYS.forEach(function (k) {
      var v = params.get(k);
      if (v) {
        all[k] = v;
        try { sessionStorage.setItem(k, v); } catch (e) {}
      } else {
        try {
          var sv = sessionStorage.getItem(k);
          if (sv) all[k] = sv;
        } catch (e) {}
      }
    });

    var pairs = Object.keys(all).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(all[k]);
    });
    return CALENDLY_URL + '?' + pairs.join('&');
  }

  // === Lazy-load Calendly widget script (once) ===
  var calendlyScriptLoaded = false;
  var calendlyScriptLoadPromise = null;
  function ensureCalendlyScript() {
    if (calendlyScriptLoadPromise) return calendlyScriptLoadPromise;
    calendlyScriptLoadPromise = new Promise(function (resolve) {
      if (window.Calendly && window.Calendly.initInlineWidget) {
        calendlyScriptLoaded = true;
        resolve();
        return;
      }
      var s = document.createElement('script');
      s.src = 'https://assets.calendly.com/assets/external/widget.js';
      s.async = true;
      s.onload = function () { calendlyScriptLoaded = true; resolve(); };
      document.head.appendChild(s);
    });
    return calendlyScriptLoadPromise;
  }

  // === Build modal DOM (once) ===
  var overlay = null;
  var widgetInitialized = false;

  function buildModalDom() {
    overlay = document.createElement('div');
    overlay.className = 'gg-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('aria-labelledby', 'gg-modal-intro-text');

    var calendlyUrl = buildCalendlyUrl();

    // Close button sits OUTSIDE the card (direct child of overlay) so that
    // the card's `transform` doesn't create a containing block for the
    // button's `position: fixed`. This keeps the X anchored to the viewport
    // top-right at all times, on a separate stacking layer well above the
    // Calendly iframe — Calendly's own back/cancel UI cannot reach this
    // pixel space.
    overlay.innerHTML = ''
      + '<button type="button" class="gg-modal-close" aria-label="Close booking dialog">'
      + '  <svg viewBox="0 0 24 24" aria-hidden="true">'
      + '    <path d="M18.3 5.71L12 12.01l-6.3-6.3-1.4 1.41 6.29 6.29-6.29 6.29 1.4 1.41 6.3-6.29 6.3 6.29 1.41-1.41-6.29-6.29 6.29-6.29z"></path>'
      + '  </svg>'
      + '</button>'
      + '<div class="gg-modal-card">'
      + '  <header class="gg-modal-header">'
      + '    <div class="gg-modal-brand"><img src="' + BASE + 'files/logo.svg" alt="The Glinda Group"></div>'
      + '  </header>'
      + '  <p class="gg-modal-intro" id="gg-modal-intro-text">'
      + '    <strong>Tell us where it hurts:</strong> 30 minutes with Jordan or Laura. Bring one specific pattern your team keeps running into.'
      + '  </p>'
      + '  <div class="gg-modal-body">'
      + '    <div class="calendly-inline-widget" data-url="' + calendlyUrl + '"></div>'
      + '  </div>'
      + '</div>';

    document.body.appendChild(overlay);

    // Defensive close handler — capture phase, kill all propagation so
    // nothing (including Calendly's iframe-adjacent listeners) can swallow it.
    var closeBtn = overlay.querySelector('.gg-modal-close');
    function onCloseClick(e) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }
      close();
    }
    closeBtn.addEventListener('click',     onCloseClick, true);   // capture
    closeBtn.addEventListener('mousedown', onCloseClick, true);   // belt + suspenders
    closeBtn.addEventListener('touchend',  onCloseClick, true);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
  }

  // === Open + close ===
  var lastFocus = null;
  var bodyOverflowBefore = null;

  function open() {
    injectStyles();
    if (!overlay) buildModalDom();

    lastFocus = document.activeElement;
    bodyOverflowBefore = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');

    // Lazy-load + initialize Calendly the first time
    ensureCalendlyScript().then(function () {
      if (widgetInitialized) return;
      // Calendly's widget.js auto-scans on its own DOM ready; for dynamic
      // content we initialize manually. If auto-scan beat us to it, our
      // call is a no-op.
      var widget = overlay.querySelector('.calendly-inline-widget');
      if (widget.querySelector('iframe')) {
        widgetInitialized = true;
        return;
      }
      if (window.Calendly && window.Calendly.initInlineWidget) {
        window.Calendly.initInlineWidget({
          url: widget.getAttribute('data-url'),
          parentElement: widget
        });
        widgetInitialized = true;
      }
    });

    // Move focus into the modal for screen readers
    setTimeout(function () {
      var closeBtn = overlay.querySelector('.gg-modal-close');
      if (closeBtn) closeBtn.focus();
    }, 50);
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = bodyOverflowBefore || '';
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus(); } catch (e) {}
    }
  }

  // Escape key — only when modal is open
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay && overlay.classList.contains('open')) {
      close();
    }
  });

  // === Listen for Calendly postMessages ===
  // Calendly's iframe posts events to the parent window when the visitor
  // navigates between views and when a booking is confirmed. We use the
  // `event_scheduled` event to auto-dismiss the modal ~1.6s after the
  // confirmation screen renders — long enough for the visitor to register
  // success, short enough that they don't have to hunt for the X afterwards.
  function isCalendlyEvent(data) {
    return data && typeof data === 'object' && typeof data.event === 'string'
        && data.event.indexOf('calendly.') === 0;
  }
  window.addEventListener('message', function (e) {
    if (!isCalendlyEvent(e.data)) return;
    // Optional debug — uncomment if Calendly events stop firing:
    // console.log('[book-modal] Calendly event:', e.data.event);
    if (e.data.event === 'calendly.event_scheduled') {
      // Auto-close after a short pause so the success screen registers.
      setTimeout(function () {
        if (overlay && overlay.classList.contains('open')) close();
      }, 1600);
    }
  });

  // === Wire CTA buttons ===
  function wireButtons() {
    var selectors = '[data-cta="nav-book"], [data-cta="primary-footer"], [data-cta="primary-hero"]';
    var buttons = document.querySelectorAll(selectors);
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var text = (btn.textContent || '').trim().toLowerCase();
      // Only intercept the "Book a call" CTAs, not "Send us a message" siblings
      if (text.indexOf('book') === -1 && text.indexOf('call') === -1) continue;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        open();
      });
    }
  }

  // Expose programmatic API for any future use (e.g., a link or
  // keyboard shortcut elsewhere on the page).
  window.GlindaBookModal = { open: open, close: close };

  // Auto-open on ?openbookcall=1 — used by the redirect from the retired
  // /book-a-call/ standalone page so old bookmarks land at /?openbookcall=1
  // and immediately surface the modal.
  function maybeAutoOpen() {
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('openbookcall') === '1') {
        // Strip the param from the URL so a refresh doesn't re-open.
        params.delete('openbookcall');
        var qs = params.toString();
        var clean = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
        try { window.history.replaceState(null, '', clean); } catch (e) {}
        open();
      }
    } catch (e) {}
  }

  function boot() {
    wireButtons();
    maybeAutoOpen();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
