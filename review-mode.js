// public/method/review-mode.js
//
// Composed 2026-05-10 from library/features/review-widget/.
// See .composition-manifest.md alongside this file for full provenance.
//
// ES module. Loaded dynamically by review-bootstrap.js after ?review=1
// is detected and review-mode.css is in the DOM. Exports an init()
// function the bootstrap calls with { basePath, config, configGlobalName }.
//
// Composition order per library/features/review-widget/intl-plural-labels.md
// §"TDZ-safe init order":
//   1. cfg lookup
//   2. LABELS construction (DEFAULT_LABELS overlaid with cfg.REVIEW_LABELS)
//   3. formatCount definition
//   4. conditional init() call
// LABELS must exist before any code that reads it. All user-facing string
// literals use SINGLE quotes per library/features/review-widget/intl-plural-labels.md
// §"Single-quoted empty-state strings".
//
// Source-of-truth: do NOT hand-edit. Re-compose via the library.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import {
  getDatabase, ref, push, update, remove, onValue
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';

// ============================================================
// DEFAULT_LABELS — canonical English defaults from the library.
// Project overrides at compose-time AND runtime via cfg.REVIEW_LABELS.
// ============================================================

const DEFAULT_LABELS = {
  locale: 'en',

  bannerText: 'Review mode',
  bannerHint: 'Hover any paragraph to leave a comment.',
  bannerClose: 'Close',

  sidebarTitle: 'Comments',
  sidebarEmpty: 'No comments yet. Click any paragraph to start.',
  noAnchorFallback: 'Comment on a removed element',
  filterActive: 'Active',
  filterArchived: 'Archived',

  toggleButton: 'Comments',
  toggleButtonTitle: 'Show comments',

  addCommentTitle: 'Add comment',
  statusPending: 'Pending',
  statusDone: 'Done',

  commentsCount: { one: '{n} comment', other: '{n} comments' },

  modalTitleNew: 'Add comment',
  modalTitleEdit: 'Edit comment',
  modalCommentLabel: 'Your comment',
  modalCommentPlaceholder: "What's the problem?",
  modalCommentHint: 'Optional if you provide a suggested replacement.',
  modalReplacementLabel: 'Suggested replacement',
  modalReplacementPlaceholder: 'Optional rewrite',
  modalReplacementHint: 'Optional if you provide commentary.',
  modalRequiredError: 'Comment or suggested replacement is required.',
  modalSubmitNew: 'Add comment',
  modalSubmitEdit: 'Save changes',
  modalCancel: 'Cancel',
  modalClose: 'Close',

  editLabel: 'Edit',
  editTitle: 'Edit this comment',
  archiveLabel: 'Archive',
  archiveTitle: 'Archive this comment',
  restoreLabel: 'Restore',
  restoreTitle: 'Restore to active',
  deleteLabel: 'Delete',
  deleteTitle: 'Delete permanently',
  confirmDelete: 'Delete this comment? This cannot be undone.',

  archiveAllLabel: 'Archive all',
  archiveAllTitle: 'Archive all comments in this group',

  saved: 'Saved',
  deleted: 'Deleted',
  restoredToActive: 'Restored to active',
  errorPrefix: 'Error: ',
  elementGone: 'The element this comment points to is no longer on the page.',

  footerSignature: ''
};

// ============================================================
// State — module-level, declared BEFORE init() so the TDZ doesn't bite.
// ============================================================

const state = {
  cfg: null,
  LABELS: null,
  pageSlug: '',
  comments: {},          // pushId -> record
  filter: 'active',      // 'active' | 'archived'
  sidebarOpen: true,
  modal: { open: false, mode: null, editingId: null, targetAnchorId: null },
  spotlightTimer: null,
  spotlightAnchorId: null,
  db: null,
  unsubscribe: null,
  loadedAt: 0,
  toastQueue: []
};

// ============================================================
// Anchor strategy (features.review-widget.anchor-strategy)
// ============================================================

const ANCHOR_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'li', 'td', 'th', 'dt', 'dd',
  'strong', 'em', 'small', 'span',
  'section', 'article', 'aside', 'header', 'footer', 'nav', 'main', 'figure'
];

function derivePageSlug() {
  let path = window.location.pathname || '/';
  path = path.replace(/\/index\.html?$/i, '');
  if (path === '' || path === '/') return 'home';
  path = path.replace(/^\/+|\/+$/g, '');
  return path.replace(/\//g, '-');
}

function selectContentArea() {
  // Default scope: <main> if present, else <section> siblings under <body>,
  // else <body>. Chrome (<nav>, <header>, <footer>) excluded by post-filter.
  return document.querySelector('main') || document.body;
}

function isInChrome(el) {
  return !!el.closest('nav, header[role="banner"], footer, .review-banner, .review-sidebar, .review-modal-backdrop, .review-toast-stack, .review-toggle');
}

function anchorPage() {
  const root = selectContentArea();
  const counters = Object.create(null);

  for (const tag of ANCHOR_TAGS) {
    const nodes = root.querySelectorAll(tag);
    nodes.forEach((el) => {
      if (isInChrome(el)) return;
      const text = (el.textContent || '').trim();
      if (text.length < 2) return;

      counters[tag] = (counters[tag] || 0) + 1;
      const n = counters[tag]; // 1-indexed per features.review-widget.anchor-strategy
      const id = `${state.pageSlug}-${tag}-${n}`;
      el.setAttribute('data-comment-id', id);

      // Mount the pill host so deepest-only hover can target it.
      if (!el.querySelector(':scope > .review-pill-container')) {
        const host = document.createElement('span');
        host.className = 'review-pill-container';
        const pill = document.createElement('button');
        pill.className = 'review-pill';
        pill.type = 'button';
        pill.textContent = state.LABELS.addCommentTitle;
        pill.title = state.LABELS.addCommentTitle;
        pill.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          openComposerNew(id);
        });
        host.appendChild(pill);
        el.appendChild(host);
      }
    });
  }

  return Object.values(counters).reduce((a, b) => a + b, 0);
}

// ============================================================
// Firebase RTDB adapter (features.review-widget.firebase-rtdb-adapter)
// ============================================================

function initRtdb() {
  const fcfg = state.cfg.FIREBASE_CONFIG;
  if (!fcfg || /^TBD/.test(fcfg.apiKey || '')) {
    // Degraded mode: config is a placeholder. We still bring up the UI,
    // but writes will throw and the toast will surface the error.
    state.db = null;
    showToast('error', state.LABELS.errorPrefix + 'Firebase config is placeholder. Writes will fail.');
    return false;
  }
  try {
    const app = initializeApp(fcfg, 'review-widget');
    state.db = getDatabase(app);
    return true;
  } catch (err) {
    state.db = null;
    showToast('error', state.LABELS.errorPrefix + (err && err.message ? err.message : 'firebase-init-error'));
    emitEvent('review.failed', {
      pageSlug: state.pageSlug,
      failedAt: Date.now(),
      reason: 'firebase-init-error',
      errorMessage: err && err.message ? err.message : '',
      recoverableHint: 'Check FIREBASE_CONFIG values in contact-form.config.js.'
    });
    return false;
  }
}

function subscribeComments(onInitial) {
  if (!state.db) {
    if (typeof onInitial === 'function') onInitial(0);
    return;
  }
  const r = ref(state.db, 'comments');
  let firstFire = true;
  state.unsubscribe = onValue(r, (snap) => {
    const all = snap.val() || {};
    // Client-side filter by page slug (per firebase-rtdb-adapter §Anti-patterns).
    const filtered = {};
    for (const [id, rec] of Object.entries(all)) {
      if (!rec || rec.page !== state.pageSlug) continue;
      // Legacy status migration: status of "applied" or "dismissed" → archived: true.
      if (rec.status && typeof rec.archived === 'undefined') {
        rec.archived = (rec.status === 'applied' || rec.status === 'dismissed');
      }
      filtered[id] = rec;
    }
    state.comments = filtered;
    renderSidebar();
    decorateHasComments();
    if (firstFire) {
      firstFire = false;
      if (typeof onInitial === 'function') onInitial(Object.keys(filtered).length);
    }
  }, (err) => {
    showToast('error', state.LABELS.errorPrefix + (err && err.message ? err.message : 'RTDB read failed'));
  });
}

async function createComment(rec) {
  if (!state.db) {
    showToast('error', state.LABELS.errorPrefix + 'No backend connection.');
    throw new Error('no-db');
  }
  const r = ref(state.db, 'comments');
  const result = await push(r, rec);
  return result.key;
}

async function updateComment(id, patch) {
  if (!state.db) {
    showToast('error', state.LABELS.errorPrefix + 'No backend connection.');
    throw new Error('no-db');
  }
  const r = ref(state.db, 'comments/' + id);
  await update(r, patch);
}

async function removeComment(id) {
  if (!state.db) {
    showToast('error', state.LABELS.errorPrefix + 'No backend connection.');
    throw new Error('no-db');
  }
  const r = ref(state.db, 'comments/' + id);
  await remove(r);
}

// ============================================================
// formatCount — plural-aware (features.review-widget.intl-plural-labels)
// Defined AFTER LABELS (constructed in init).
// ============================================================

function formatCount(n, key) {
  const label = state.LABELS[key];
  if (!label || typeof label !== 'object') return String(n);
  const locale = state.LABELS.locale || 'en';
  let cat;
  try {
    cat = new Intl.PluralRules(locale).select(n);
  } catch (_) {
    cat = (n === 1) ? 'one' : 'other';
  }
  const tpl = label[cat] || label.other || label.one || '{n}';
  return tpl.replace('{n}', String(n));
}

// ============================================================
// Comment grouping (anchor-keyed) + state derivation
// ============================================================

function commentsByAnchor() {
  const groups = {};
  for (const [id, rec] of Object.entries(state.comments)) {
    const a = rec.anchor || '';
    if (!groups[a]) groups[a] = [];
    groups[a].push({ id, ...rec });
  }
  // Sort comments within group oldest-first (natural reading order).
  for (const a of Object.keys(groups)) {
    groups[a].sort((x, y) => (x.timestamp || 0) - (y.timestamp || 0));
  }
  return groups;
}

function groupStatus(groupComments) {
  const active = groupComments.filter((c) => !c.archived);
  if (active.length > 0) return 'pending';
  return 'archived';
}

function groupLastActivity(groupComments) {
  return groupComments.reduce((max, c) => {
    return Math.max(max, c.edited_at || c.archived_at || c.timestamp || 0);
  }, 0);
}

// ============================================================
// Rendering
// ============================================================

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'on' && typeof v === 'object') {
      for (const [evt, handler] of Object.entries(v)) node.addEventListener(evt, handler);
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(node.style, v);
    } else if (k.startsWith('aria-') || k === 'role' || k === 'type' || k === 'tabindex') {
      node.setAttribute(k, v);
    } else if (k === 'dataset') {
      for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    } else if (k === 'text') {
      node.textContent = v;
    } else if (k === 'html') {
      node.innerHTML = v;
    } else {
      node[k] = v;
    }
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  }
  return node;
}

function mountBanner() {
  const banner = el('header', {
    class: 'review-banner',
    role: 'banner'
  },
    el('div', {},
      el('span', { class: 'review-banner-text', text: state.LABELS.bannerText }),
      el('span', { class: 'review-banner-hint', text: state.LABELS.bannerHint })
    ),
    el('button', {
      class: 'review-banner-close',
      type: 'button',
      'aria-label': state.LABELS.bannerClose,
      text: state.LABELS.bannerClose,
      on: { click: () => exitReview() }
    })
  );
  document.body.insertBefore(banner, document.body.firstChild);
}

function mountSidebar() {
  const sidebar = el('aside', {
    class: 'review-sidebar',
    role: 'complementary',
    'aria-label': state.LABELS.sidebarTitle,
    dataset: { open: String(state.sidebarOpen) }
  },
    el('div', { class: 'review-sidebar-header' },
      el('h2', { class: 'review-sidebar-title', text: state.LABELS.sidebarTitle }),
      el('div', { class: 'review-sidebar-filters', role: 'tablist' },
        filterTab('active', state.LABELS.filterActive),
        filterTab('archived', state.LABELS.filterArchived)
      )
    ),
    el('div', { class: 'review-sidebar-body' }),
    el('footer', {
      class: 'review-sidebar-footer',
      text: state.LABELS.footerSignature || ''
    })
  );
  document.body.appendChild(sidebar);
}

function filterTab(key, label) {
  return el('button', {
    class: 'review-filter-tab',
    type: 'button',
    role: 'tab',
    'aria-pressed': String(state.filter === key),
    dataset: { key },
    text: label,
    on: {
      click: () => {
        state.filter = key;
        renderSidebar();
      }
    }
  });
}

function mountToggle() {
  const toggle = el('button', {
    class: 'review-toggle',
    type: 'button',
    'aria-pressed': String(state.sidebarOpen),
    'aria-label': state.LABELS.toggleButtonTitle || state.LABELS.toggleButton,
    title: state.LABELS.toggleButtonTitle || '',
    on: {
      click: () => {
        state.sidebarOpen = !state.sidebarOpen;
        const sb = document.querySelector('.review-sidebar');
        if (sb) sb.dataset.open = String(state.sidebarOpen);
        toggle.setAttribute('aria-pressed', String(state.sidebarOpen));
        renderCountBadge();
      }
    }
  });
  document.body.appendChild(toggle);
  renderCountBadge();
}

function renderCountBadge() {
  const toggle = document.querySelector('.review-toggle');
  if (!toggle) return;
  toggle.innerHTML = '';
  toggle.appendChild(document.createTextNode(state.LABELS.toggleButton));
  const pending = Object.values(state.comments).filter((c) => !c.archived).length;
  if (pending > 0) {
    const badge = el('span', { class: 'review-toggle-count', text: String(pending) });
    toggle.appendChild(badge);
  }
}

function renderSidebar() {
  const body = document.querySelector('.review-sidebar-body');
  if (!body) return;
  body.innerHTML = '';

  const filterTabs = document.querySelectorAll('.review-filter-tab');
  filterTabs.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.key === state.filter)));

  const groups = commentsByAnchor();
  const visible = Object.entries(groups).filter(([_, comments]) => {
    return groupStatus(comments) === state.filter;
  });

  if (visible.length === 0) {
    body.appendChild(el('p', { class: 'review-sidebar-empty', text: state.LABELS.sidebarEmpty }));
    renderCountBadge();
    return;
  }

  // Sort groups by last-activity descending.
  visible.sort((a, b) => groupLastActivity(b[1]) - groupLastActivity(a[1]));

  for (const [anchorId, comments] of visible) {
    body.appendChild(renderGroup(anchorId, comments));
  }
  renderCountBadge();
}

function renderGroup(anchorId, comments) {
  const status = groupStatus(comments);
  const activeCount = comments.filter((c) => !c.archived).length;

  const header = el('div', { class: 'review-group-header' },
    el('span', { class: 'review-group-anchor', text: anchorId }),
    el('span', {
      class: 'review-pill-status',
      dataset: { variant: status === 'pending' ? 'status-pending' : 'status-done' },
      text: status === 'pending' ? formatCount(activeCount, 'commentsCount') : state.LABELS.statusDone
    })
  );

  const preview = comments[0] && comments[0].text_preview
    ? el('p', { class: 'review-group-preview', text: '"' + comments[0].text_preview + '"' })
    : null;

  const rows = el('ul', { class: 'review-group-rows' });
  for (const c of comments) {
    rows.appendChild(renderRow(c));
  }

  const groupEl = el('div', { class: 'review-group', dataset: { anchor: anchorId } },
    header, preview, rows
  );

  // Bulk archive footer — only for pending groups with multiple active comments.
  if (status === 'pending' && activeCount > 1) {
    groupEl.appendChild(el('div', { class: 'review-group-bulk' },
      el('button', {
        class: 'review-group-bulk-button',
        type: 'button',
        text: state.LABELS.archiveAllLabel,
        title: state.LABELS.archiveAllTitle,
        on: { click: () => bulkArchive(comments.filter((c) => !c.archived).map((c) => c.id)) }
      })
    ));
  }

  return groupEl;
}

function renderRow(c) {
  const actions = el('div', { class: 'review-row-actions' });

  if (!c.archived) {
    actions.appendChild(el('button', {
      class: 'review-row-action', type: 'button',
      text: state.LABELS.editLabel,
      title: state.LABELS.editTitle,
      on: { click: (ev) => { ev.stopPropagation(); openComposerEdit(c); } }
    }));
    actions.appendChild(el('button', {
      class: 'review-row-action', type: 'button',
      text: state.LABELS.archiveLabel,
      title: state.LABELS.archiveTitle,
      on: { click: (ev) => { ev.stopPropagation(); archiveComment(c.id, 'row'); } }
    }));
  } else {
    actions.appendChild(el('button', {
      class: 'review-row-action', type: 'button',
      text: state.LABELS.restoreLabel,
      title: state.LABELS.restoreTitle,
      on: { click: (ev) => { ev.stopPropagation(); restoreComment(c.id); } }
    }));
  }
  actions.appendChild(el('button', {
    class: 'review-row-action', type: 'button',
    dataset: { variant: 'danger' },
    text: state.LABELS.deleteLabel,
    title: state.LABELS.deleteTitle,
    on: { click: (ev) => { ev.stopPropagation(); confirmAndDelete(c); } }
  }));

  const row = el('li', {
    class: 'review-comment-row',
    role: 'button',
    tabindex: '0',
    dataset: { id: c.id },
    on: {
      click: () => activateSpotlight(c.anchor),
      keydown: (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          activateSpotlight(c.anchor);
        }
      }
    }
  },
    el('p', { class: 'review-row-text', text: c.comment || '' }),
    c.replacement ? el('p', { class: 'review-row-replacement', text: c.replacement }) : null,
    el('div', { class: 'review-row-meta' },
      el('span', { text: new Date(c.timestamp || 0).toLocaleString(state.LABELS.locale || 'en') }),
      c.edited_at ? el('span', { text: '· edited' }) : null
    ),
    actions
  );
  return row;
}

function decorateHasComments() {
  // Walk all anchored elements; set data-has-comments="true" where the
  // group is non-empty.
  const counts = {};
  for (const c of Object.values(state.comments)) {
    counts[c.anchor] = (counts[c.anchor] || 0) + 1;
  }
  document.querySelectorAll('[data-comment-id]').forEach((el) => {
    const id = el.getAttribute('data-comment-id');
    if (counts[id]) el.setAttribute('data-has-comments', 'true');
    else el.removeAttribute('data-has-comments');
  });
}

// ============================================================
// Spotlight (features.review-widget.spotlight-on-click)
// ============================================================

function activateSpotlight(anchorId) {
  // Clear previous
  if (state.spotlightTimer) {
    clearTimeout(state.spotlightTimer);
    state.spotlightTimer = null;
  }
  if (state.spotlightAnchorId) {
    const prev = document.querySelector(`[data-comment-id="${cssEscape(state.spotlightAnchorId)}"]`);
    if (prev) prev.classList.remove('review-spotlit');
  }

  const elTarget = document.querySelector(`[data-comment-id="${cssEscape(anchorId)}"]`);
  const found = !!elTarget;

  emitEvent('spotlight.activated', {
    anchorId,
    pageSlug: state.pageSlug,
    found,
    triggeredAt: Date.now()
  });

  if (!found) {
    showToast('error', state.LABELS.elementGone);
    return;
  }

  elTarget.classList.add('review-spotlit');
  elTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
  state.spotlightAnchorId = anchorId;
  state.spotlightTimer = setTimeout(() => {
    elTarget.classList.remove('review-spotlit');
    state.spotlightAnchorId = null;
    state.spotlightTimer = null;
  }, 4000);
}

function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

// ============================================================
// Composer modal (features.review-widget.comment-lifecycle)
// ============================================================

function openComposerNew(anchorId) {
  state.modal = { open: true, mode: 'new', editingId: null, targetAnchorId: anchorId };
  renderModal();
}

function openComposerEdit(c) {
  state.modal = { open: true, mode: 'edit', editingId: c.id, targetAnchorId: c.anchor };
  renderModal(c);
}

function closeComposer(via) {
  state.modal = { open: false, mode: null, editingId: null, targetAnchorId: null };
  const m = document.querySelector('.review-modal-backdrop');
  if (m) m.remove();
}

function renderModal(existing) {
  const old = document.querySelector('.review-modal-backdrop');
  if (old) old.remove();
  if (!state.modal.open) return;

  const isEdit = state.modal.mode === 'edit';
  const title = isEdit ? state.LABELS.modalTitleEdit : state.LABELS.modalTitleNew;

  const commentInput = el('textarea', {
    class: 'review-field-input',
    placeholder: state.LABELS.modalCommentPlaceholder,
    rows: '3',
    value: existing && existing.comment ? existing.comment : ''
  });
  const replacementInput = el('textarea', {
    class: 'review-field-input',
    placeholder: state.LABELS.modalReplacementPlaceholder,
    rows: '3',
    value: existing && existing.replacement ? existing.replacement : ''
  });
  const errorEl = el('div', {
    class: 'review-modal-error',
    role: 'alert',
    text: state.LABELS.modalRequiredError
  });

  const submit = async (ev) => {
    ev.preventDefault();
    const comment = commentInput.value.trim();
    const replacement = replacementInput.value.trim();
    if (!comment && !replacement) {
      errorEl.setAttribute('data-shown', 'true');
      return;
    }
    errorEl.removeAttribute('data-shown');

    try {
      if (isEdit) {
        await updateComment(state.modal.editingId, {
          comment, replacement, edited_at: Date.now()
        });
        emitEvent('comment.edited', {
          id: state.modal.editingId,
          pageSlug: state.pageSlug,
          anchorId: state.modal.targetAnchorId,
          text: comment, replacementText: replacement,
          editedAt: Date.now()
        });
      } else {
        const anchor = state.modal.targetAnchorId;
        const anchorEl = document.querySelector(`[data-comment-id="${cssEscape(anchor)}"]`);
        if (!anchorEl) {
          showToast('error', state.LABELS.elementGone);
          return;
        }
        const text_preview = (anchorEl.textContent || '').trim().slice(0, 80);
        const rec = {
          comment, replacement,
          anchor, page: state.pageSlug,
          archived: false,
          timestamp: Date.now(),
          text_preview,
          url: window.location.href,
          user_agent: navigator.userAgent
        };
        const newId = await createComment(rec);
        emitEvent('comment.created', {
          id: newId,
          pageSlug: state.pageSlug,
          anchorId: anchor,
          text: comment, replacementText: replacement,
          createdAt: rec.timestamp
        });
      }
      showToast('success', state.LABELS.saved);
      closeComposer('submit');
    } catch (err) {
      showToast('error', state.LABELS.errorPrefix + (err && err.message ? err.message : 'save failed'));
    }
  };

  const backdrop = el('div', {
    class: 'review-modal-backdrop',
    on: { click: (ev) => { if (ev.target === backdrop) closeComposer('backdrop'); } }
  },
    el('div', {
      class: 'review-modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'review-modal-title'
    },
      el('header', { class: 'review-modal-header' },
        el('h3', { class: 'review-modal-title', id: 'review-modal-title', text: title }),
        el('button', {
          class: 'review-modal-close',
          type: 'button',
          'aria-label': state.LABELS.modalClose,
          html: '&times;',
          on: { click: () => closeComposer('closeButton') }
        })
      ),
      el('form', { class: 'review-modal-body', on: { submit } },
        el('div', { class: 'review-field' },
          el('label', { class: 'review-field-label', text: state.LABELS.modalCommentLabel }),
          commentInput,
          el('small', { class: 'review-field-hint', text: state.LABELS.modalCommentHint })
        ),
        el('div', { class: 'review-field' },
          el('label', { class: 'review-field-label', text: state.LABELS.modalReplacementLabel }),
          replacementInput,
          el('small', { class: 'review-field-hint', text: state.LABELS.modalReplacementHint })
        ),
        errorEl
      ),
      el('div', { class: 'review-modal-actions' },
        el('button', {
          class: 'review-btn review-btn--secondary',
          type: 'button',
          dataset: { variant: 'secondary' },
          text: state.LABELS.modalCancel,
          on: { click: () => closeComposer('cancelButton') }
        }),
        el('button', {
          class: 'review-btn review-btn--primary',
          type: 'button',
          dataset: { variant: 'primary' },
          text: isEdit ? state.LABELS.modalSubmitEdit : state.LABELS.modalSubmitNew,
          on: { click: submit }
        })
      )
    )
  );
  document.body.appendChild(backdrop);

  // Escape-key dismissal
  const escHandler = (ev) => {
    if (ev.key === 'Escape') {
      closeComposer('escape');
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  commentInput.focus();
}

// ============================================================
// Comment lifecycle handlers
// ============================================================

async function archiveComment(id, via) {
  try {
    await updateComment(id, { archived: true, archived_at: Date.now() });
    emitEvent('comment.archived', {
      id, pageSlug: state.pageSlug,
      anchorId: state.comments[id] ? state.comments[id].anchor : '',
      archivedAt: Date.now(),
      via: via || 'row'
    });
    showToast('success', state.LABELS.saved);
  } catch (err) {
    showToast('error', state.LABELS.errorPrefix + (err && err.message ? err.message : 'archive failed'));
  }
}

async function restoreComment(id) {
  try {
    await updateComment(id, { archived: false, archived_at: null });
    emitEvent('comment.restored', {
      id, pageSlug: state.pageSlug,
      anchorId: state.comments[id] ? state.comments[id].anchor : '',
      restoredAt: Date.now()
    });
    showToast('success', state.LABELS.restoredToActive);
  } catch (err) {
    showToast('error', state.LABELS.errorPrefix + (err && err.message ? err.message : 'restore failed'));
  }
}

async function confirmAndDelete(c) {
  if (!confirm(state.LABELS.confirmDelete)) return;
  try {
    const snapshot = { ...c };
    await removeComment(c.id);
    emitEvent('comment.deleted', {
      id: c.id, pageSlug: state.pageSlug, anchorId: c.anchor,
      deletedAt: Date.now(), via: 'row',
      snapshot: {
        text: c.comment, replacementText: c.replacement,
        status: c.archived ? 'archived' : 'active',
        createdAt: c.timestamp || 0
      }
    });
    showToast('success', state.LABELS.deleted);
  } catch (err) {
    showToast('error', state.LABELS.errorPrefix + (err && err.message ? err.message : 'delete failed'));
  }
}

async function bulkArchive(ids) {
  for (const id of ids) {
    await archiveComment(id, 'bulk');
  }
}

// Public API for programmatic bulk-archive (per pending-archived-workflow §"Bulk archive at group level")
window.__review = window.__review || {};
window.__review.archiveComments = async function (ids) {
  for (const id of ids) {
    await updateComment(id, { archived: true, archived_at: Date.now() });
    emitEvent('comment.archived', {
      id, pageSlug: state.pageSlug,
      anchorId: state.comments[id] ? state.comments[id].anchor : '',
      archivedAt: Date.now(), via: 'bulk'
    });
  }
};

window.__review.teardown = function () {
  if (state.unsubscribe) state.unsubscribe();
  document.querySelectorAll('.review-banner, .review-sidebar, .review-toggle, .review-modal-backdrop, .review-toast-stack').forEach((n) => n.remove());
  document.documentElement.removeAttribute('data-review-mode');
  emitEvent('review.exited', {
    pageSlug: state.pageSlug,
    exitedAt: Date.now(),
    durationMs: Date.now() - state.loadedAt,
    via: 'programmatic',
    commentsAtExit: Object.keys(state.comments).length
  });
};

// ============================================================
// Toasts
// ============================================================

function ensureToastStack() {
  let stack = document.querySelector('.review-toast-stack');
  if (!stack) {
    stack = el('div', { class: 'review-toast-stack' });
    document.body.appendChild(stack);
  }
  return stack;
}

function showToast(variant, message) {
  const stack = ensureToastStack();
  const toast = el('div', { class: 'review-toast', dataset: { variant }, role: variant === 'error' ? 'alert' : 'status', 'aria-live': variant === 'error' ? 'assertive' : 'polite' },
    el('span', { text: message }),
    el('button', {
      class: 'review-toast-close',
      type: 'button',
      'aria-label': state.LABELS.modalClose,
      html: '&times;',
      on: { click: () => toast.remove() }
    })
  );
  stack.appendChild(toast);
  // Cap at 3 visible — oldest dismisses first (FIFO).
  const all = stack.querySelectorAll('.review-toast');
  while (all.length > 3) {
    all[0].remove();
  }
  setTimeout(() => { toast.remove(); }, 3500);
}

// ============================================================
// Events
// ============================================================

function emitEvent(name, detail) {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch (_) { /* silent */ }
}

// ============================================================
// Banner exit
// ============================================================

function exitReview() {
  // Strip ?review=1 from the URL via history; reload to fully tear down.
  const url = new URL(window.location.href);
  url.searchParams.delete('review');
  window.location.href = url.toString();
}

// Page-unload event (per events.review-exited.md)
window.addEventListener('pagehide', () => {
  emitEvent('review.exited', {
    pageSlug: state.pageSlug,
    exitedAt: Date.now(),
    durationMs: Date.now() - state.loadedAt,
    via: 'pagehide',
    commentsAtExit: Object.keys(state.comments).length
  });
});

// ============================================================
// init() — called by review-bootstrap.js after CSS + module load
// ============================================================

export async function init({ basePath, config, configGlobalName }) {
  state.cfg = config || {};
  // Build LABELS by overlaying cfg.REVIEW_LABELS onto DEFAULT_LABELS (shallow).
  const overrides = (state.cfg.REVIEW_LABELS) || {};
  state.LABELS = Object.assign({}, DEFAULT_LABELS, overrides);
  // Merge nested plural objects (commentsCount) since shallow overlay would clobber.
  if (overrides.commentsCount) {
    state.LABELS.commentsCount = Object.assign({}, DEFAULT_LABELS.commentsCount, overrides.commentsCount);
  }

  state.pageSlug = derivePageSlug();
  state.loadedAt = Date.now();
  state.sidebarOpen = window.innerWidth > 800;

  // Bring up RTDB (may fail silently into degraded mode).
  initRtdb();

  // Mount chrome.
  mountBanner();
  mountSidebar();
  mountToggle();

  // Anchor the content area.
  const anchoredCount = anchorPage();

  // Subscribe to comments; on initial fetch, emit review.entered.
  subscribeComments((initialCount) => {
    emitEvent('review.entered', {
      pageSlug: state.pageSlug,
      loadedAt: state.loadedAt,
      anchoredCount,
      commentsAtLoad: initialCount
    });
  });

  // If RTDB is in degraded mode (placeholder config), still emit review.entered
  // so consumers know the page loaded; the toast already surfaced the degraded state.
  if (!state.db) {
    setTimeout(() => {
      emitEvent('review.entered', {
        pageSlug: state.pageSlug,
        loadedAt: state.loadedAt,
        anchoredCount,
        commentsAtLoad: 0
      });
    }, 0);
  }
}
