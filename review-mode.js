// public/method/review-mode.js
//
// Re-emitted 2026-05-12 (prota-alignment pass) from library/features/review-widget/.
// Glinda brand colors preserved; class names + DOM structure aligned with prota's
// deployed reference (prota-studio/public/website/review-mode.js). New "applied"
// state in the comment lifecycle, three-tab filter (active / applied / archived),
// pill rendered as `+` glyph instead of "Add comment" text, sidebar reserves
// right gutter, single center-bottom toast.
//
// Variation recorded at .claude/variations/review-widget.md.
// Composition manifest update at public/method/.composition-manifest.md.
//
// ES module. Loaded dynamically by review-bootstrap.js after ?review=1.
// TDZ-safe init order: cfg lookup → LABELS construction → formatCount →
// conditional init(). LABELS must exist before any code that reads it.
// All user-facing string literals use SINGLE quotes (per the
// intl-plural-labels §"Single-quoted empty-state strings" rule).
//
// Source-of-truth: do NOT hand-edit. Re-compose via the library.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import {
  getDatabase, ref, push, update, remove, onValue
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';

// ============================================================
// DEFAULT_LABELS — overlays cfg.REVIEW_LABELS at runtime.
// ============================================================

const DEFAULT_LABELS = {
  locale: 'en',

  bannerText: 'Review mode',
  bannerExit: 'Exit',

  sidebarTitle: 'Comments',
  sidebarEmpty: 'No comments yet. Hover any paragraph to add one.',
  filterActive: 'Active',
  filterApplied: 'Applied',
  filterArchived: 'Archived',

  toggleSidebar: 'Comments',

  statusPending: 'pending',
  statusApplied: 'applied',

  commentsCount: { one: '{n} comment', other: '{n} comments' },

  modalTitleNew: 'Add comment',
  modalTitleEdit: 'Edit comment',
  modalCommentLabel: 'Your comment',
  modalCommentOpt: '(optional if you provide a replacement)',
  modalCommentPlaceholder: "What's the problem?",
  modalReplacementLabel: 'Suggested replacement',
  modalReplacementOpt: '(optional if you provide a comment)',
  modalReplacementPlaceholder: 'Optional rewrite',
  modalRequiredError: 'Comment or suggested replacement is required.',
  modalSubmitNew: 'Add comment',
  modalSubmitEdit: 'Save changes',
  modalCancel: 'Cancel',

  applyLabel: 'Apply',
  editLabel: 'Edit',
  archiveLabel: 'Archive',
  restoreLabel: 'Restore',
  deleteLabel: 'Delete',
  archiveGroupLabel: 'Mark group as done',
  confirmDelete: 'Delete this comment? This cannot be undone.',

  saved: 'Saved',
  applied: 'Applied',
  archived: 'Archived',
  restored: 'Restored to active',
  deleted: 'Deleted',
  errorPrefix: 'Error: ',
  elementGone: 'The element this comment points to is no longer on the page.',
  noBackend: 'No backend connection.',
  firebasePlaceholder: 'Firebase config is placeholder. Writes will fail.',

  groupCount: { one: '{n} comment', other: '{n} comments' }
};

// ============================================================
// State — module-level, declared BEFORE init() so the TDZ doesn't bite.
// Comment status enum: 'pending' (default) | 'applied' | 'archived'.
// Legacy records carry boolean `archived`; migrated on read.
// ============================================================

const state = {
  cfg: null,
  LABELS: null,
  pageSlug: '',
  comments: {},
  filter: 'active',
  sidebarOpen: false,
  modal: { open: false, mode: null, editingId: null, targetAnchorId: null },
  spotlightTimer: null,
  spotlightAnchorId: null,
  toastTimer: null,
  db: null,
  unsubscribe: null,
  loadedAt: 0
};

// ============================================================
// Anchor strategy
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
  return document.querySelector('main') || document.body;
}

function isInChrome(el) {
  return !!el.closest('nav, header[role="banner"], footer, .review-banner, .review-sidebar, .review-sidebar-toggle, .review-modal-backdrop, .review-toast');
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
      const n = counters[tag];
      const id = `${state.pageSlug}-${tag}-${n}`;
      el.setAttribute('data-comment-id', id);

      if (!el.querySelector(':scope > .review-pill-container')) {
        const host = document.createElement('span');
        host.className = 'review-pill-container';
        const pill = document.createElement('button');
        pill.className = 'review-pill';
        pill.type = 'button';
        pill.textContent = '+';
        pill.setAttribute('aria-label', state.LABELS.modalTitleNew);
        pill.title = state.LABELS.modalTitleNew;
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
// Firebase RTDB adapter
// ============================================================

function initRtdb() {
  const fcfg = state.cfg.FIREBASE_CONFIG;
  if (!fcfg || /^TBD/.test(fcfg.apiKey || '')) {
    state.db = null;
    showToast(state.LABELS.errorPrefix + state.LABELS.firebasePlaceholder);
    return false;
  }
  try {
    const app = initializeApp(fcfg, 'review-widget');
    state.db = getDatabase(app);
    return true;
  } catch (err) {
    state.db = null;
    showToast(state.LABELS.errorPrefix + (err && err.message ? err.message : 'firebase-init-error'));
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
    const filtered = {};
    for (const [id, rec] of Object.entries(all)) {
      if (!rec || rec.page !== state.pageSlug) continue;
      // Migrate legacy records: archived boolean + status string → status enum
      if (!rec.status) {
        if (rec.archived === true) rec.status = 'archived';
        else if (rec.applied === true) rec.status = 'applied';
        else rec.status = 'pending';
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
    showToast(state.LABELS.errorPrefix + (err && err.message ? err.message : 'RTDB read failed'));
  });
}

async function createComment(rec) {
  if (!state.db) { showToast(state.LABELS.errorPrefix + state.LABELS.noBackend); throw new Error('no-db'); }
  const r = ref(state.db, 'comments');
  const result = await push(r, rec);
  return result.key;
}

async function updateComment(id, patch) {
  if (!state.db) { showToast(state.LABELS.errorPrefix + state.LABELS.noBackend); throw new Error('no-db'); }
  await update(ref(state.db, 'comments/' + id), patch);
}

async function removeComment(id) {
  if (!state.db) { showToast(state.LABELS.errorPrefix + state.LABELS.noBackend); throw new Error('no-db'); }
  await remove(ref(state.db, 'comments/' + id));
}

// ============================================================
// formatCount — plural-aware
// ============================================================

function formatCount(n, key) {
  const label = state.LABELS[key];
  if (!label || typeof label !== 'object') return String(n);
  const locale = state.LABELS.locale || 'en';
  let cat;
  try { cat = new Intl.PluralRules(locale).select(n); } catch (_) { cat = (n === 1) ? 'one' : 'other'; }
  const tpl = label[cat] || label.other || label.one || '{n}';
  return tpl.replace('{n}', String(n));
}

// ============================================================
// Grouping + group state derivation
// ============================================================

function commentsByAnchor() {
  const groups = {};
  for (const [id, rec] of Object.entries(state.comments)) {
    const a = rec.anchor || '';
    if (!groups[a]) groups[a] = [];
    groups[a].push({ id, ...rec });
  }
  for (const a of Object.keys(groups)) {
    groups[a].sort((x, y) => (x.timestamp || 0) - (y.timestamp || 0));
  }
  return groups;
}

// Group state: 'pending' (≥1 comment pending), 'applied' (all non-archived comments applied),
// 'archived' (all comments archived). Used for filter routing + group-status badge.
function groupStatus(groupComments) {
  const nonArchived = groupComments.filter((c) => c.status !== 'archived');
  if (nonArchived.length === 0) return 'archived';
  const allApplied = nonArchived.every((c) => c.status === 'applied');
  if (allApplied) return 'applied';
  return 'pending';
}

function groupLastActivity(groupComments) {
  return groupComments.reduce((max, c) => Math.max(
    max,
    c.applied_at || c.edited_at || c.archived_at || c.timestamp || 0
  ), 0);
}

// ============================================================
// Element helper
// ============================================================

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'on' && typeof v === 'object') {
      for (const [evt, handler] of Object.entries(v)) node.addEventListener(evt, handler);
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(node.style, v);
    } else if (k.startsWith('aria-') || k === 'role' || k === 'type' || k === 'tabindex' || k === 'href') {
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

// ============================================================
// Banner — gradient + pulse dot + exit link
// ============================================================

function mountBanner() {
  const banner = el('header', {
    class: 'review-banner',
    role: 'banner'
  },
    el('div', {},
      el('span', { class: 'dot' }),
      document.createTextNode(state.LABELS.bannerText)
    ),
    el('a', {
      href: '#exit',
      text: state.LABELS.bannerExit,
      on: { click: (ev) => { ev.preventDefault(); exitReview(); } }
    })
  );
  document.body.insertBefore(banner, document.body.firstChild);
}

// ============================================================
// Sidebar — header + filter-row + comments list
// ============================================================

function mountSidebar() {
  const sidebar = el('aside', {
    class: 'review-sidebar' + (state.sidebarOpen ? ' open' : ''),
    role: 'complementary',
    'aria-label': state.LABELS.sidebarTitle
  },
    el('header', {},
      el('span', { text: state.LABELS.sidebarTitle }),
      el('span', { class: 'count', text: '' })
    ),
    el('div', { class: 'filter-row', role: 'tablist' },
      filterTab('active', state.LABELS.filterActive),
      filterTab('applied', state.LABELS.filterApplied),
      filterTab('archived', state.LABELS.filterArchived)
    ),
    el('div', { class: 'comments' })
  );
  document.body.appendChild(sidebar);
}

function filterTab(key, label) {
  return el('button', {
    type: 'button',
    role: 'tab',
    class: state.filter === key ? 'active' : '',
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
    class: 'review-sidebar-toggle',
    type: 'button',
    'aria-label': state.LABELS.toggleSidebar,
    text: state.LABELS.toggleSidebar,
    on: {
      click: () => {
        state.sidebarOpen = !state.sidebarOpen;
        const sb = document.querySelector('.review-sidebar');
        if (sb) sb.classList.toggle('open', state.sidebarOpen);
      }
    }
  });
  document.body.appendChild(toggle);
}

function renderSidebar() {
  const body = document.querySelector('.review-sidebar .comments');
  if (!body) return;
  body.innerHTML = '';

  // Update active state on filter tabs
  const tabs = document.querySelectorAll('.review-sidebar .filter-row button');
  tabs.forEach((t) => {
    const isActive = t.dataset.key === state.filter;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-pressed', String(isActive));
  });

  const groups = commentsByAnchor();
  const visible = Object.entries(groups).filter(([_, comments]) => groupStatus(comments) === state.filter);

  // Header count — total non-archived comments visible across pageSlug
  const headerCountEl = document.querySelector('.review-sidebar header .count');
  if (headerCountEl) {
    const totalVisible = Object.values(state.comments).filter((c) => c.status !== 'archived').length;
    headerCountEl.textContent = totalVisible > 0 ? formatCount(totalVisible, 'commentsCount') : '';
  }

  if (visible.length === 0) {
    body.appendChild(el('div', { class: 'empty', text: state.LABELS.sidebarEmpty }));
    return;
  }

  visible.sort((a, b) => groupLastActivity(b[1]) - groupLastActivity(a[1]));

  for (const [anchorId, comments] of visible) {
    body.appendChild(renderGroup(anchorId, comments));
  }
}

function renderGroup(anchorId, comments) {
  const status = groupStatus(comments);
  const nonArchived = comments.filter((c) => c.status !== 'archived');
  const count = nonArchived.length;

  const previewText = comments[0] && comments[0].text_preview ? '"' + comments[0].text_preview + '"' : '';

  const header = el('div', { class: 'review-group-header',
    on: { click: () => activateSpotlight(anchorId) }
  },
    el('div', { class: 'anchor-row' },
      el('span', { class: 'anchor', text: anchorId }),
      status !== 'archived' ? el('span', {
        class: 'group-status ' + status,
        text: status === 'applied' ? state.LABELS.statusApplied : state.LABELS.statusPending
      }) : null
    ),
    previewText ? el('div', { class: 'anchor-preview', text: previewText }) : null,
    count > 0 ? el('div', { class: 'group-count', text: formatCount(count, 'groupCount') }) : null
  );

  const groupEl = el('div', { class: 'review-group', dataset: { anchor: anchorId } }, header);

  for (const c of comments) {
    groupEl.appendChild(renderComment(c));
  }

  // Group footer — "Mark group as done" — only when pending and > 1 active comments
  if (status === 'pending' && count > 1) {
    groupEl.appendChild(el('div', { class: 'review-group-footer' },
      el('button', {
        type: 'button',
        class: 'archive-group-btn',
        text: state.LABELS.archiveGroupLabel,
        on: { click: () => bulkArchive(nonArchived.map((c) => c.id)) }
      })
    ));
  }

  return groupEl;
}

function renderComment(c) {
  const statusClass = c.status === 'applied' ? ' applied' : (c.status === 'archived' ? ' archived' : '');

  const actions = el('div', { class: 'actions' });

  if (c.status === 'pending') {
    actions.appendChild(el('button', {
      class: 'apply-btn', type: 'button', text: state.LABELS.applyLabel,
      on: { click: (ev) => { ev.stopPropagation(); applyComment(c.id); } }
    }));
    actions.appendChild(el('button', {
      class: 'edit-btn', type: 'button', text: state.LABELS.editLabel,
      on: { click: (ev) => { ev.stopPropagation(); openComposerEdit(c); } }
    }));
    actions.appendChild(el('button', {
      class: 'archive-btn', type: 'button', text: state.LABELS.archiveLabel,
      on: { click: (ev) => { ev.stopPropagation(); archiveComment(c.id, 'row'); } }
    }));
  } else if (c.status === 'applied') {
    actions.appendChild(el('button', {
      class: 'restore-btn', type: 'button', text: state.LABELS.restoreLabel,
      on: { click: (ev) => { ev.stopPropagation(); restoreComment(c.id); } }
    }));
    actions.appendChild(el('button', {
      class: 'archive-btn', type: 'button', text: state.LABELS.archiveLabel,
      on: { click: (ev) => { ev.stopPropagation(); archiveComment(c.id, 'row'); } }
    }));
  } else {
    actions.appendChild(el('button', {
      class: 'restore-btn', type: 'button', text: state.LABELS.restoreLabel,
      on: { click: (ev) => { ev.stopPropagation(); restoreComment(c.id); } }
    }));
  }
  actions.appendChild(el('button', {
    class: 'delete-btn', type: 'button', text: state.LABELS.deleteLabel,
    on: { click: (ev) => { ev.stopPropagation(); confirmAndDelete(c); } }
  }));

  return el('div', {
    class: 'review-comment' + statusClass,
    role: 'button',
    tabindex: '0',
    dataset: { id: c.id },
    on: {
      click: () => activateSpotlight(c.anchor),
      keydown: (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); activateSpotlight(c.anchor); }
      }
    }
  },
    el('div', { class: 'text', text: c.comment || '' }),
    c.replacement ? el('div', { class: 'replacement', text: c.replacement }) : null,
    el('div', { class: 'meta' },
      el('span', { text: new Date(c.timestamp || 0).toLocaleString(state.LABELS.locale || 'en') }),
      c.edited_at ? el('span', { text: 'edited' }) : null
    ),
    actions
  );
}

// ============================================================
// State-class decoration on anchored elements + pills
// ============================================================

function decorateHasComments() {
  // Per-anchor: has-comment (any non-archived), has-applied-comment (all non-archived applied)
  const byAnchor = {};
  for (const c of Object.values(state.comments)) {
    if (!byAnchor[c.anchor]) byAnchor[c.anchor] = [];
    byAnchor[c.anchor].push(c);
  }

  document.querySelectorAll('[data-comment-id]').forEach((el) => {
    const id = el.getAttribute('data-comment-id');
    const list = byAnchor[id] || [];
    const nonArchived = list.filter((c) => c.status !== 'archived');
    const allApplied = nonArchived.length > 0 && nonArchived.every((c) => c.status === 'applied');

    el.classList.toggle('has-comment', nonArchived.length > 0);
    el.classList.toggle('has-applied-comment', allApplied);

    const pill = el.querySelector(':scope > .review-pill-container > .review-pill');
    if (pill) {
      pill.classList.toggle('has-comment', nonArchived.length > 0);
      pill.classList.toggle('has-applied-comment', allApplied);
    }
  });
}

// ============================================================
// Spotlight — 1500ms pulse, single-spotlight policy
// ============================================================

function activateSpotlight(anchorId) {
  if (state.spotlightTimer) { clearTimeout(state.spotlightTimer); state.spotlightTimer = null; }
  if (state.spotlightAnchorId) {
    const prev = document.querySelector(`[data-comment-id="${cssEscape(state.spotlightAnchorId)}"]`);
    if (prev) prev.classList.remove('review-spotlit');
  }

  const elTarget = document.querySelector(`[data-comment-id="${cssEscape(anchorId)}"]`);
  const found = !!elTarget;

  emitEvent('spotlight.activated', { anchorId, pageSlug: state.pageSlug, found, triggeredAt: Date.now() });

  if (!found) { showToast(state.LABELS.elementGone); return; }

  elTarget.classList.add('review-spotlit');
  elTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
  state.spotlightAnchorId = anchorId;
  state.spotlightTimer = setTimeout(() => {
    elTarget.classList.remove('review-spotlit');
    state.spotlightAnchorId = null;
    state.spotlightTimer = null;
  }, 1500);
}

function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

// ============================================================
// Composer modal — flat prota-aligned structure
// ============================================================

function openComposerNew(anchorId) {
  state.modal = { open: true, mode: 'new', editingId: null, targetAnchorId: anchorId };
  renderModal();
}
function openComposerEdit(c) {
  state.modal = { open: true, mode: 'edit', editingId: c.id, targetAnchorId: c.anchor };
  renderModal(c);
}
function closeComposer() {
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
  const anchorId = state.modal.targetAnchorId;
  const anchorEl = document.querySelector(`[data-comment-id="${cssEscape(anchorId)}"]`);
  const previewText = anchorEl ? (anchorEl.textContent || '').trim().slice(0, 120) : '';

  const commentInput = el('textarea', {
    placeholder: state.LABELS.modalCommentPlaceholder,
    rows: '3'
  });
  if (existing && existing.comment) commentInput.value = existing.comment;

  const replacementInput = el('textarea', {
    placeholder: state.LABELS.modalReplacementPlaceholder,
    rows: '3'
  });
  if (existing && existing.replacement) replacementInput.value = existing.replacement;

  const errorEl = el('div', { class: 'error', text: '' });

  const submit = async (ev) => {
    ev.preventDefault();
    const comment = commentInput.value.trim();
    const replacement = replacementInput.value.trim();
    if (!comment && !replacement) {
      errorEl.textContent = state.LABELS.modalRequiredError;
      return;
    }
    errorEl.textContent = '';

    try {
      if (isEdit) {
        await updateComment(state.modal.editingId, { comment, replacement, edited_at: Date.now() });
        emitEvent('comment.edited', {
          id: state.modal.editingId, pageSlug: state.pageSlug,
          anchorId, text: comment, replacementText: replacement, editedAt: Date.now()
        });
      } else {
        if (!anchorEl) { showToast(state.LABELS.elementGone); return; }
        const text_preview = (anchorEl.textContent || '').trim().slice(0, 80);
        const rec = {
          comment, replacement,
          anchor: anchorId, page: state.pageSlug,
          status: 'pending',
          timestamp: Date.now(),
          text_preview,
          url: window.location.href,
          user_agent: navigator.userAgent
        };
        const newId = await createComment(rec);
        emitEvent('comment.created', {
          id: newId, pageSlug: state.pageSlug, anchorId,
          text: comment, replacementText: replacement, createdAt: rec.timestamp
        });
      }
      showToast(state.LABELS.saved);
      closeComposer();
    } catch (err) {
      showToast(state.LABELS.errorPrefix + (err && err.message ? err.message : 'save failed'));
    }
  };

  const modal = el('div', {
    class: 'review-modal',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'review-modal-title'
  },
    el('h3', { id: 'review-modal-title', text: title }),
    el('div', { class: 'anchor-info', text: anchorId }),
    previewText ? el('div', { class: 'anchor-preview', text: '"' + previewText + '"' }) : null,
    el('label', {},
      document.createTextNode(state.LABELS.modalCommentLabel + ' '),
      el('span', { class: 'opt', text: state.LABELS.modalCommentOpt })
    ),
    commentInput,
    el('label', {},
      document.createTextNode(state.LABELS.modalReplacementLabel + ' '),
      el('span', { class: 'opt', text: state.LABELS.modalReplacementOpt })
    ),
    replacementInput,
    errorEl,
    el('div', { class: 'actions' },
      el('button', {
        type: 'button',
        class: 'review-btn review-btn--secondary',
        text: state.LABELS.modalCancel,
        on: { click: () => closeComposer() }
      }),
      el('button', {
        type: 'button',
        class: 'review-btn review-btn--primary',
        text: isEdit ? state.LABELS.modalSubmitEdit : state.LABELS.modalSubmitNew,
        on: { click: submit }
      })
    )
  );

  const backdrop = el('div', {
    class: 'review-modal-backdrop',
    on: { click: (ev) => { if (ev.target === backdrop) closeComposer(); } }
  }, modal);
  document.body.appendChild(backdrop);

  const escHandler = (ev) => {
    if (ev.key === 'Escape') {
      closeComposer();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  commentInput.focus();
}

// ============================================================
// Comment lifecycle — apply / archive / restore / delete
// ============================================================

async function applyComment(id) {
  try {
    await updateComment(id, { status: 'applied', applied_at: Date.now() });
    emitEvent('comment.applied', {
      id, pageSlug: state.pageSlug,
      anchorId: state.comments[id] ? state.comments[id].anchor : '',
      appliedAt: Date.now()
    });
    showToast(state.LABELS.applied);
  } catch (err) {
    showToast(state.LABELS.errorPrefix + (err && err.message ? err.message : 'apply failed'));
  }
}

async function archiveComment(id, via) {
  try {
    await updateComment(id, { status: 'archived', archived_at: Date.now() });
    emitEvent('comment.archived', {
      id, pageSlug: state.pageSlug,
      anchorId: state.comments[id] ? state.comments[id].anchor : '',
      archivedAt: Date.now(), via: via || 'row'
    });
    showToast(state.LABELS.archived);
  } catch (err) {
    showToast(state.LABELS.errorPrefix + (err && err.message ? err.message : 'archive failed'));
  }
}

async function restoreComment(id) {
  try {
    await updateComment(id, { status: 'pending', archived_at: null, applied_at: null });
    emitEvent('comment.restored', {
      id, pageSlug: state.pageSlug,
      anchorId: state.comments[id] ? state.comments[id].anchor : '',
      restoredAt: Date.now()
    });
    showToast(state.LABELS.restored);
  } catch (err) {
    showToast(state.LABELS.errorPrefix + (err && err.message ? err.message : 'restore failed'));
  }
}

async function confirmAndDelete(c) {
  if (!confirm(state.LABELS.confirmDelete)) return;
  try {
    await removeComment(c.id);
    emitEvent('comment.deleted', {
      id: c.id, pageSlug: state.pageSlug, anchorId: c.anchor,
      deletedAt: Date.now(), via: 'row',
      snapshot: {
        text: c.comment, replacementText: c.replacement,
        status: c.status || 'pending',
        createdAt: c.timestamp || 0
      }
    });
    showToast(state.LABELS.deleted);
  } catch (err) {
    showToast(state.LABELS.errorPrefix + (err && err.message ? err.message : 'delete failed'));
  }
}

async function bulkArchive(ids) {
  for (const id of ids) {
    await archiveComment(id, 'bulk');
  }
}

window.__review = window.__review || {};
window.__review.archiveComments = async function (ids) {
  for (const id of ids) {
    await updateComment(id, { status: 'archived', archived_at: Date.now() });
    emitEvent('comment.archived', {
      id, pageSlug: state.pageSlug,
      anchorId: state.comments[id] ? state.comments[id].anchor : '',
      archivedAt: Date.now(), via: 'bulk'
    });
  }
};

window.__review.teardown = function () {
  if (state.unsubscribe) state.unsubscribe();
  document.querySelectorAll('.review-banner, .review-sidebar, .review-sidebar-toggle, .review-modal-backdrop, .review-toast').forEach((n) => n.remove());
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
// Toast — single center-bottom, 2.6s auto-dismiss
// ============================================================

function showToast(message) {
  const existing = document.querySelector('.review-toast');
  if (existing) existing.remove();
  if (state.toastTimer) { clearTimeout(state.toastTimer); state.toastTimer = null; }

  const toast = el('div', { class: 'review-toast', role: 'status', 'aria-live': 'polite', text: message });
  document.body.appendChild(toast);
  state.toastTimer = setTimeout(() => { toast.remove(); state.toastTimer = null; }, 2800);
}

// ============================================================
// Events
// ============================================================

function emitEvent(name, detail) {
  try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) { /* silent */ }
}

function exitReview() {
  const url = new URL(window.location.href);
  url.searchParams.delete('review');
  window.location.href = url.toString();
}

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
// init() — called by review-bootstrap.js
// ============================================================

export async function init({ basePath, config, configGlobalName }) {
  state.cfg = config || {};
  const overrides = (state.cfg.REVIEW_LABELS) || {};
  state.LABELS = Object.assign({}, DEFAULT_LABELS, overrides);
  if (overrides.commentsCount) state.LABELS.commentsCount = Object.assign({}, DEFAULT_LABELS.commentsCount, overrides.commentsCount);
  if (overrides.groupCount) state.LABELS.groupCount = Object.assign({}, DEFAULT_LABELS.groupCount, overrides.groupCount);

  state.pageSlug = derivePageSlug();
  state.loadedAt = Date.now();
  state.sidebarOpen = window.innerWidth > 800;

  initRtdb();

  mountBanner();
  mountSidebar();
  mountToggle();

  const anchoredCount = anchorPage();

  subscribeComments((initialCount) => {
    emitEvent('review.entered', {
      pageSlug: state.pageSlug,
      loadedAt: state.loadedAt,
      anchoredCount,
      commentsAtLoad: initialCount
    });
  });

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
