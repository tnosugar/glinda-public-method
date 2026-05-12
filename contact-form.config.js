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
// Firebase posture (2026-05-13): Real Firebase project `glinda-website`
// provisioned. Widget loads in full mode when ?review=1; LP form submits
// land at RTDB /leads/{pushId}. Security is rule-based (no auth) —
// rules JSON lives at brand/firebase-rules.json and is pasted into
// Firebase console → Realtime Database → Rules tab.
//
// API key safety: Firebase Web config values are designed to be public.
// They're identifiers, not secrets. Database security rules (NOT this
// config) are what control access. This file is safe to commit + serve.

window.GLINDA_CONTACT_CONFIG = {

  // ============================================================
  // commentLifecycleMode — 'full' | 'feedback-only'
  // ============================================================
  // Per library/features/review-widget/comment-lifecycle.md §"Per-comment
  // actions in the sidebar". 'feedback-only' trims the in-UI button set so
  // reviewers leave comments (status: pending) and Claude / operator works
  // the RTDB directly to set status: applied or archived. The UI exposes
  // Edit + Delete on pending, Restore + Delete on applied/archived. The
  // group-footer bulk-archive button is suppressed in feedback-only mode.
  //
  // 2026-05-14: previously a glinda variation maintained via local fork of
  // renderComment() + renderGroup(); now canonical per upstream PR.
  commentLifecycleMode: 'feedback-only',

  // ============================================================
  // ANCHOR_TAGS_EXTRA — additional tags to anchor beyond the canonical list
  // ============================================================
  // Per library/features/review-widget/anchor-extensibility.md
  // §"ANCHOR_TAGS_EXTRA — project-level tag-list extension". These five
  // additions cover glinda's LP / testimonial surfaces:
  //   - label       form-field labels (LP contact form)
  //   - blockquote  testimonial quote bodies
  //   - cite        testimonial attributions
  //   - figcaption  figure captions (any future image+caption surfaces)
  //   - button      CTA buttons — reviewers comment on copy
  //
  // Anti-pattern: never put 'div' here (every container becomes anchorable,
  // UX collapses). Use the per-element [data-comment-target] attribute on
  // specific wrapper divs in index.html instead.
  //
  // 2026-05-14: previously a glinda variation maintained via local fork
  // of ANCHOR_TAGS; now canonical per upstream PR.
  //
  // 2026-05-15: rendered redundant in this project's config because
  // commentableContent: 'direct-text' (below) anchors any text-bearing
  // element regardless of tag. Keeping the key set anyway so a flip back
  // to commentableContent: 'allowlist' would still cover glinda's surfaces.
  ANCHOR_TAGS_EXTRA: ['label', 'blockquote', 'cite', 'figcaption', 'button'],

  // ============================================================
  // commentableContent — 'allowlist' | 'direct-text'
  // ============================================================
  // Per library/features/review-widget/commentable-everything.md.
  // 'allowlist' (default): iterate ANCHOR_TAGS ∪ ANCHOR_TAGS_EXTRA ∪
  //   [data-comment-target].
  // 'direct-text': anchor any element with direct text content >= 2 chars,
  //   filtered by NEVER_ANCHOR deny-list (form controls, SVG internals,
  //   void elements, etc.). Catches every text-bearing element including
  //   <a>, <button>, <label>, custom tags — reviewer expectation that
  //   "if there's text, I should be able to comment on it."
  //
  // 2026-05-15: previously a glinda variation maintained via local fork
  // of selectContentArea() + tryAnchor(); now canonical per upstream PR.
  commentableContent: 'direct-text',

  // ============================================================
  // chromeAnchored — boolean
  // ============================================================
  // Per library/features/review-widget/commentable-everything.md.
  // true: site chrome (nav, header[role="banner"], footer) is anchored
  //   with shared chrome-{tag}-{n} slugs (page-independent). Comments on
  //   chrome elements write page: '__chrome__' and surface on every page.
  // false (default): chrome skipped from anchoring.
  //
  // Requires chrome STRUCTURALLY IDENTICAL across pages or CHROME_COUNTERS
  // drift causes mis-anchored comments. Glinda's LP pages share the same
  // <nav>, <header>, <footer> markup, so this is safe.
  //
  // 2026-05-15: previously a glinda variation maintained via local fork
  // of isInChrome() / selectContentArea() / tryAnchor() / write-handler /
  // read-filter; now canonical per upstream PR.
  chromeAnchored: true,

  // ============================================================
  // FIREBASE_CONFIG — glinda-website project (provisioned 2026-05-13)
  // ============================================================
  // Realtime Database paths:
  //   /comments/{pushId}  — review-widget comments per features.review-widget.firebase-rtdb-adapter
  //   /leads/{pushId}     — LP contact-form submits per content/web/testing-matrix.md §"Lead capture flow"
  FIREBASE_CONFIG: {
    apiKey:            "AIzaSyAC3f0IH9-s7XU9fTE3jbk7Bhfn20uTIdY",
    authDomain:        "glinda-website.firebaseapp.com",
    databaseURL:       "https://glinda-website-default-rtdb.firebaseio.com",
    projectId:         "glinda-website",
    storageBucket:     "glinda-website.firebasestorage.app",
    messagingSenderId: "244199801855",
    appId:             "1:244199801855:web:82838197aab888d894ddca",
    measurementId:     "G-R8YJ0J0FC2"
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
