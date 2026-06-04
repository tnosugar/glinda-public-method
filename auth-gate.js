// public/method/auth-gate.js
//
// Gates the review-widget behind Firebase Auth + an email allow-list.
//
// On every page load:
//   1. Load Firebase Auth SDK (compat) from gstatic CDN.
//   2. Check onAuthStateChanged. If a user is signed in AND their email
//      matches the allow-list, dynamically inject
//        - contact-form.config.js   (Firebase config + REVIEW_LABELS)
//        - review-bootstrap.js      (entry-button + ?review=1 bootstrap)
//      so the review widget activates.
//   3. If not signed in (or signed in but not allow-listed): do nothing.
//      The review widget scripts are NEVER loaded; ?review=1 does
//      nothing; the floating Comments button never appears.
//
// Static-source guarantee: view-source on any page when signed out will
// show this file only. No review-bootstrap.js / review-mode.js URLs,
// no contact-form.config.js URL.
//
// Logout helper: window.glindaLogout() signs out + reloads.
//
// Login: /login/  (unlisted; team bookmarks it).
//
// Firebase Console setup checklist: see public/method/AUTH_SETUP.md.

(function () {
  'use strict';

  // === Public Firebase config (per Firebase docs: web config is safe to embed) ===
  var FIREBASE_CONFIG = {
    apiKey:            "AIzaSyAC3f0IH9-s7XU9fTE3jbk7Bhfn20uTIdY",
    authDomain:        "glinda-website.firebaseapp.com",
    databaseURL:       "https://glinda-website-default-rtdb.firebaseio.com",
    projectId:         "glinda-website",
    storageBucket:     "glinda-website.firebasestorage.app",
    messagingSenderId: "244199801855",
    appId:             "1:244199801855:web:82838197aab888d894ddca",
    measurementId:     "G-R8YJ0J0FC2"
  };

  // === Email allow-list (case-insensitive) ===
  // If a user authenticates with an email NOT in this list, the gate
  // blocks them silently. Update both this list AND the matching list
  // in brand/firebase-rules.json when adding/removing team members.
  var ALLOWLIST = [
    'jordan@glindagroup.com',
    'laura@glindagroup.com',
    'team@2-human.com'
  ].map(function (e) { return e.toLowerCase(); });

  // === Self-locate so we can resolve sibling-script URLs ===
  // Self-located = where this very script was loaded from. Works for
  // both depth-0 (home: ./auth-gate.js) and depth-2 (LPs:
  // ../../auth-gate.js) inclusions.
  var SCRIPT_URL = (function () {
    if (document.currentScript && document.currentScript.src) {
      return document.currentScript.src;
    }
    // Fallback for browsers that don't populate currentScript reliably
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && scripts[i].src.indexOf('auth-gate.js') >= 0) {
        return scripts[i].src;
      }
    }
    return null;
  })();
  var BASE = SCRIPT_URL ? SCRIPT_URL.replace(/auth-gate\.js.*$/, '') : './';

  // === Lazy-load helper ===
  function loadScript(src, callback) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = callback || function () {};
    s.onerror = function () {
      console.error('[auth-gate] Failed to load: ' + src);
    };
    document.head.appendChild(s);
  }

  // === Bootstrap Firebase Auth ===
  var FB_VERSION = '9.23.0';
  var FB_BASE = 'https://www.gstatic.com/firebasejs/' + FB_VERSION + '/';

  loadScript(FB_BASE + 'firebase-app-compat.js', function () {
    loadScript(FB_BASE + 'firebase-auth-compat.js', function () {
      // Init Firebase (idempotent: skip if already initialized)
      if (typeof firebase === 'undefined') {
        console.error('[auth-gate] Firebase SDK failed to register');
        return;
      }
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      var auth = firebase.auth();

      // Expose logout helper for /logout/ and any UI button
      window.glindaLogout = function () {
        return firebase.auth().signOut().then(function () {
          window.location.href = BASE;
        });
      };

      // Track injection so we don't double-load on auth-state replay
      var injected = false;

      auth.onAuthStateChanged(function (user) {
        if (injected) return;
        if (!user || !user.email) return;
        var email = user.email.toLowerCase();
        if (ALLOWLIST.indexOf(email) === -1) {
          console.warn('[auth-gate] Signed-in email not in allow-list: ' + email);
          return;
        }
        injected = true;
        console.log('[auth-gate] Signed in as ' + email + ' — loading review module');
        // Load config first (sets window.GLINDA_CONTACT_CONFIG), then bootstrap.
        loadScript(BASE + 'contact-form.config.js', function () {
          loadScript(BASE + 'review-bootstrap.js');
        });
      });
    });
  });
})();
