/**
 * The planner board's page-scoped theme.
 *
 * The board is the one screen in the app that sets its own neutrals — cool
 * rather than warm. The rules live in `.planner-theme` in
 * `src/app/globals.css`; this constant is what turns them on, and it is
 * deliberately the *only* thing that does.
 *
 * **It no longer sets its own typeface.** The board ran on Tajawal while the
 * rest of the app ran on Almarai, which made the planner read as a different
 * product from the rail sitting beside it. That override is gone; the board
 * inherits Almarai from the app's `:lang(ar)` block like every other screen.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **To go back to the app's global neutrals, set this to `''`.**
 *
 * That is the whole revert. Every call site reads this constant, so an empty
 * string leaves the `.planner-theme` block in globals.css matching nothing and
 * the board falls back to the warm ramp, with no other edit anywhere. Delete
 * the CSS block too if the revert is permanent.
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
