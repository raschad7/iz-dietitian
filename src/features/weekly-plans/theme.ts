/**
 * The planner board's page-scoped theme.
 *
 * The board is the one screen in the app that sets its own face (Tajawal) and
 * its own neutrals (cool rather than warm). The rules live in
 * `.planner-theme` in `src/app/globals.css`; this constant is what turns them
 * on, and it is deliberately the *only* thing that does.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **To go back to the app's global font and neutrals, set this to `''`.**
 *
 * That is the whole revert. Every call site reads this constant, so an empty
 * string leaves the `.planner-theme` block in globals.css matching nothing and
 * the board falls back to Neo Sans Arabic / Readex Pro and the warm ramp, with
 * no other edit anywhere. Delete the CSS block too if the revert is permanent.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It is applied to the page wrapper rather than to `<body>` on purpose: the app
 * rail is chrome shared with every other screen, and having it change face when
 * you open the planner would read as a bug. The cost is that content which
 * *portals* out of the wrapper — the client picker's dropdown, the dish
 * catalog's filter popover — lands on `document.body` and escapes the scope, so
 * those two carry the class explicitly. Anything else that starts portaling
 * from this page needs the same treatment.
 */
export const PLANNER_THEME = 'planner-theme';
