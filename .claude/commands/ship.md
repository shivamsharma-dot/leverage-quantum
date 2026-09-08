---
description: Ship a change to Leverage Quantum the way this repo requires - build, push, verify live, log.
---

Follow this exact sequence for the change just made (or about to be made) in this repo. Do not skip a step because it seems obviously fine - this sequence exists because every step has caused a real production bug when skipped (see CLAUDE.md history).

1. **Build.** Run `npm run build` (frontend) and/or `node --check <file>.mjs` (any touched serverless file) and confirm it passes clean before touching git. A green build does NOT catch runtime crashes (React hooks-order bugs, `ERR_REQUIRE_ESM`, TDZ reference errors) - it only proves the syntax compiles.

2. **Push.** Commit with a clear message and push directly to `main`. This repo's standing convention is no feature branches, no PR - straight to main, Vercel auto-deploys.

3. **Wait for deploy.** Typically ~15-60s. Occasionally much slower (documented cases of 8-25 minutes with no visible cause). If it seems stuck past ~10 minutes, check `vercel ls` for the deployment status, or push a trivial follow-up commit / run `vercel --prod --yes` to unstick it - don't just wait indefinitely.

4. **Verify LIVE, with an actual screenshot - never DOM-text or an API response alone.** Load the real page in the browser tool and look at the rendered result; check the console for real errors (the extension's "message channel closed" noise is known-benign, ignore it). A passing `innerText.includes(...)` check or a clean API response is NOT proof a UI change renders correctly - this repo has shipped real user-visible bugs (a Dropdown text overflow, a native date input where a custom picker was required) that only a screenshot caught, after a text-only check said "verified."

5. **Log it.** Append a dated entry to the bottom of CLAUDE.md: what changed and why, anything that broke along the way and how it was diagnosed (root cause, not just the fix), and exactly how it was verified live - including what was NOT verified, if anything. Match this file's own established entry style; don't write a vague summary.

Standing rules to double-check before calling it done (all documented near the top of CLAUDE.md):
- Brand colors only - navy `#1F3C84` / blue `#1C9FD4` / cyan `#29B9C3` / green `#4CAE6F`. Never amber/orange/red/purple on any data element.
- No new files in `api/` - Vercel Hobby is capped at 12/12 serverless functions. Extend an existing file's `mode=`/dispatch branch instead.
- Any `.js` file under `api/` that imports `lib/auth.mjs` must `await import('../lib/auth.mjs')` *inside* the handler, never a static top-level `import` - or production throws `ERR_REQUIRE_ESM`.
- Any access-control change must stay in sync across `lib/auth.mjs` (`canAccessDashboard`), `src/App.jsx` (`canAccess`) and `Sidebar.jsx` (`canSee`) - prefer importing the shared `shared/access.mjs` helper over hand-duplicating logic in more than one place.
- Consider mobile responsiveness on every change, however small - this is a standing rule the user has asked for explicitly, not optional polish.
- Never commit or discard `src/pages/DashboardHome.jsx` without first checking `git status` and confirming with the user - it has a documented history of being kept intentionally uncommitted.
