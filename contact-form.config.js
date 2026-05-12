// public/method/contact-form.config.js
//
// Project input for the review-widget composition. Read at composition time
// for code-generation parameters and at runtime for backend connection +
// user-facing labels.
//
// Convention per library/features/review-widget/FEATURE.md: the config
// global is named {PROJECT}_CONTACT_CONFIG. For glinda, that is
// GLINDA_CONTACT_CONFIG. The bootstrap script looks it up on window
// after this file is loaded.
//
// Label keys here follow the canonical inventory from the library
// components + feature-atomics (banner.md props, sidebar-drawer.md props,
// comment-lifecycle.md actions, intl-plural-labels.md plural shape, etc.).
// Only keys glinda wants different from the English defaults are listed;
// everything else falls through to DEFAULT_LABELS inside review-mode.js.
//
// The file is loaded by every public/method/**/index.html page via a
// <script src="..."> tag placed BEFORE review-bootstrap.js. The relative
// path differs per page nesting depth.
//
// Firebase posture (2026-05-10): the FIREBASE_CONFIG values are
// placeholders. With placeholders in place, the widget loads in
// "degraded mode" when ?review=1 is set — UI renders, composer accepts
// input, persistence fails silently. Default (no ?review=1) remains
// fully inert. Replace placeholders with real Firebase project values
// once provisioned.

window.GLINDA_CONTACT_CONFIG = {

  // ============================================================
  // FIREBASE_CONFIG
  // ============================================================
  // Realtime Database (not Firestore). Path: /comments/{pushId}
  // per features.review-widget.firebase-rtdb-adapter.
  FIREBASE_CONFIG: {
    apiKey:            "TBD-replace-with-real-firebase-api-key",
    authDomain:        "TBD-replace-with-real.firebaseapp.com",
    databaseURL:       "https://TBD-replace-with-real.firebaseio.com",
    projectId:         "TBD-replace-with-real",
    storageBucket:     "TBD-replace-with-real.appspot.com",
    messagingSenderId: "TBD",
    appId:             "TBD"
  },

  // ============================================================
  // REVIEW_LABELS
  // ============================================================
  // Overrides on top of DEFAULT_LABELS in review-mode.js. Unspecified
  // keys fall through to the English defaults.
  REVIEW_LABELS: {
    locale: "en",

    // Toggle controls (per inert-entry-button.md + components/toggle-button.md)
    // Shared label set: the inert-page entry button (bottom-right floating
    // pill) AND the mobile sidebar-collapse toggle use the same label keys
    // for cross-surface consistency.
    toggleButton: "Comments",
    toggleButtonTitle: "Open comment review mode",

    // Banner — context-specific (this is the Glinda Method site)
    bannerText: "Reviewing the Glinda Method",
    bannerHint: "Hover any paragraph to leave a comment.",

    // Sidebar
    sidebarTitle: "Comments",
    sidebarEmpty: "No comments yet. Click any paragraph to start.",

    // Modal composer — Glinda tone (slightly warmer than the generic defaults)
    modalCommentPlaceholder: "What's not quite landing here?",
    modalReplacementPlaceholder: "Optional — rewrite it the way you'd like to see it.",

    // Footer — Glinda house signature per .claude/variations/voice-md-shape.md
    footerSignature: "Kindness is Cooler than Coolness."
  }

};
