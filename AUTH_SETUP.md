# Auth setup checklist — review-widget access gate

One-time Firebase Console setup to activate the auth gate that ships in
this repo. Total time: ~5–7 minutes of clicking. Owner: whoever has
Firebase Console access on the `glinda-website` project.

## What this gates

After this setup is complete:

- **Public visitors** see the engage.glindagroup.com home + LPs as
  normal. No review-widget scripts load, the floating "Comments" button
  never appears, `?review=1` does nothing. View-source confirms the
  review-widget URLs are absent from the static HTML.
- **Authenticated team members** (after signing in at
  `engage.glindagroup.com/login/`) see the floating "Comments" button on
  every page and can leave / apply / archive comments as before. The
  Firebase RTDB rules require their email to write comments, so the
  database itself is locked down — not just the UI.

## Allow-list

Three accounts are hard-coded into both:

- `public/method/auth-gate.js`   — front-end gate
- `brand/firebase-rules.json`    — database-level gate

```
jordan@glindagroup.com
laura@glindagroup.com
team@2-human.com
```

To add or remove someone later, update both files (search-and-replace
the email), commit, paste the new rules JSON into Firebase Console.

## Steps

### 1. Enable the Email/Password sign-in provider (~30 seconds)

Firebase Console → **glinda-website** project →
Build → **Authentication** → **Sign-in method** tab →
under "Native providers", click **Email/Password** →
toggle the first switch **Enable** → **Save**.

(Don't enable the "Email link (passwordless sign-in)" toggle below it
— we're using passwords.)

### 2. Create the three team accounts (~2 minutes)

Firebase Console → Authentication → **Users** tab →
**Add user** button. For each of the three emails above:

1. Email: e.g., `jordan@glindagroup.com`
2. Password: pick a strong temporary password
3. **Add user**
4. Share the email + temp password with that person via a secure
   channel (1Password, Signal, etc.). On first sign-in they can hit
   "Forgot your password?" to set their own.

### 3. Deploy the updated database rules (~1 minute)

Firebase Console → Build → **Realtime Database** → **Rules** tab.

1. Open `brand/firebase-rules.json` from this repo (the current file at
   HEAD after the auth-gate commit lands).
2. Copy its full contents.
3. Paste into the Rules editor in the Console.
4. Click **Publish**.

The `/comments/` node now requires `auth.token.email` ∈ allow-list for
both reads and writes. The `/leads/` node stays open for anonymous
form submits (the LP lead-capture form must work without sign-in).

**Drift gotcha** (CLAUDE.md §3): every time `brand/firebase-rules.json`
changes in this repo, repeat step 3 above to keep the deployed rules
in sync. The 2026-05-16 incident (`utm_term` validator drift) was
caused by skipping this step.

## Verification

After the three setup steps:

### Signed-out check

1. Open a new incognito/private window.
2. Visit https://engage.glindagroup.com/ (don't sign in).
3. View source. Confirm:
   - **No** `review-bootstrap.js` reference
   - **No** `contact-form.config.js` reference
   - **One** `auth-gate.js` reference
4. Confirm no floating "Comments" button appears.
5. Try `https://engage.glindagroup.com/?review=1` — confirm nothing
   changes (no banner, no sidebar, no widget).

### Signed-in check

1. Visit https://engage.glindagroup.com/login/.
2. Sign in with one of the three allow-listed accounts.
3. Page redirects to `/`.
4. Wait 1–2 seconds (Firebase Auth init). Floating "Comments" button
   should appear bottom-right.
5. Click it. URL gains `?review=1`. Page reloads with full review
   chrome (banner, sidebar, anchor pills).
6. Leave a test comment on any paragraph. Confirm the toast says
   "Saved" (not "Error").
7. View RTDB at Firebase Console → Realtime Database → Data →
   `/comments/`. The new comment appears with the team email's
   user uid implicit in `auth` context (the comment payload itself
   doesn't currently include the email; that's a future enhancement).

### Sign-out

Visit `https://engage.glindagroup.com/logout/`. You're signed out and
redirected to `/`. Floating button no longer appears.

## Troubleshooting

- **"auth/user-not-found" on sign-in** → you haven't created that
  account in step 2 yet.
- **"auth/wrong-password"** → temp password mistyped, or the team
  member already changed it via "Forgot password?".
- **Floating button doesn't appear after sign-in** → check browser
  console for `[auth-gate]` messages. If you see "Signed-in email not
  in allow-list: …", the address you signed in with isn't in the
  hard-coded allow-list. Update `auth-gate.js`.
- **401 on comment save** → the RTDB rules haven't been re-published
  with the new auth-gated `/comments/` rules (step 3 above).
- **Sign-in form shows blank or stalls** → Firebase SDK failed to load
  from gstatic. Network issue or Firebase outage; retry.

## Files involved

- `public/method/auth-gate.js` — front-end gate (loaded on every page).
- `public/method/login/index.html` — sign-in form.
- `public/method/logout/index.html` — sign-out helper page.
- `brand/firebase-rules.json` — database-level allow-list.
- All 8 production HTML pages (`public/method/index.html` + 7 LPs) —
  load `auth-gate.js` instead of the review-widget scripts directly.

## Related decisions

A decision-log entry covering this rollout should land at
`.claude/decisions/2026-06-03-review-widget-auth-gate.md` in the same
commit that ships this code.
