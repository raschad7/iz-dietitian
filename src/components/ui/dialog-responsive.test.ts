import { describe, expect, test } from 'bun:test';

/**
 * The responsive frame is a stylesheet, not a component, so this is what stands
 * in for a render test of it: the guarantees live in `globals.css` and are
 * asserted here against the source.
 *
 * Each case names the failure it would catch, because a source assertion that
 * only says "the string is still there" teaches nobody why it may not be
 * deleted. The measured behaviour behind them — footer 221px off screen at
 * 320×640, 468px of content below the fold on a landscape phone — is recorded
 * in the block comment the rules carry.
 */
const CSS = await Bun.file(`${import.meta.dir}/../../app/globals.css`).text();

/**
 * `globals.css` with comments stripped and whitespace flattened, so prose
 * cannot satisfy a test and neither line endings nor a reflow can break one.
 */
const RULES = CSS.replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** A source file's code, with its comments removed. */
async function codeOf(path: string): Promise<string> {
  const source = await Bun.file(`${import.meta.dir}/../../${path}`).text();
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

describe('the viewport tokens', () => {
  test('declares a keyboard inset that defaults to zero', () => {
    /*
     * Without the declaration, `var(--q-keyboard-inset)` is invalid at
     * computed-value time wherever `KeyboardInset` has not run — every server
     * render, every page before hydration, every browser with the script
     * blocked — and it takes the whole declaration it appears in with it.
     */
    expect(RULES).toContain('--q-keyboard-inset: 0px;');
  });

  test('derives the usable block extent from the dynamic viewport less the keyboard', () => {
    expect(RULES).toContain('--q-viewport-block: calc(100dvh - var(--q-keyboard-inset));');
  });
});

describe('the responsive dialog frame', () => {
  /** The frame's own rule block, isolated so a match elsewhere cannot pass. */
  const FRAME = RULES.slice(
    RULES.indexOf('.q-dialog[open]:not(.planner-context-sheet):not(.app-navigation-drawer) { --q-dialog-block-gutter'),
  ).slice(0, 600);

  test('makes an open dialog a flex column', () => {
    // A `<dialog>` is `display: block` from the UA stylesheet, so header, body
    // and footer share one block flow and none of them can be told to stay.
    expect(FRAME).toContain('display: flex;');
    expect(FRAME).toContain('flex-direction: column;');
  });

  test('caps the height against the keyboard-aware viewport, not the UA ceiling', () => {
    // The UA gives `max-height: calc(100% - 6px - 2em)` against the *layout*
    // viewport, which on iOS is taller than the screen shows, and taller again
    // than what is left above an open keyboard.
    expect(FRAME).toContain('max-block-size: min(');
    expect(FRAME).toContain('var(--q-viewport-block)');
  });

  test('lets a call site tighten that ceiling but never remove it', () => {
    expect(FRAME).toContain('var(--q-dialog-max-block, 100dvh)');
  });

  test('lifts the surface above the keyboard rather than transforming it', () => {
    /*
     * A modal dialog is `position: fixed` against the layout viewport, which
     * iOS does not shrink for the keyboard — so the cap alone leaves a sheet
     * sitting on an edge that is now behind the keys. A `transform` would move
     * it and would also make it the containing block for the popup positioners
     * portaled into it, which are `fixed` on a coarse pointer.
     */
    expect(FRAME).toContain('inset-block-end: var(--q-keyboard-inset);');
    expect(FRAME).not.toMatch(/transform: translate/);
  });

  test('hands the scrolling to the body, and clips only when there is one', () => {
    // `overflow: hidden` on a dialog with nothing to scroll inside it makes the
    // overflow unreachable, which is worse than the UA's `overflow: auto`.
    expect(RULES).toContain(
      ":has( > [data-slot='dialog-body'], > :where(form, div) > [data-slot='dialog-body'] ) { overflow: hidden;",
    );
    expect(RULES).toContain(
      ":not( :has(> [data-slot='dialog-body'], > :where(form, div) > [data-slot='dialog-body']) ) { overflow: auto; overscroll-behavior: contain;",
    );
  });

  test('asks for a body only where the frame would drive one', () => {
    /*
     * A dialog may contain another: the custom-food dialog renders inside the
     * dish editor's own form. A descendant `:has()` let that nested, *closed*
     * dialog's body answer for its host, and the host was clipped on the
     * strength of a scrollport that was `display: none` and not its own.
     */
    expect(RULES).not.toContain(":has( [data-slot='dialog-body'] )");
    expect(RULES).not.toContain(":not(:has([data-slot='sheet-body']))");
  });

  test('gives the body a bounded, contained scrollport', () => {
    // Anchored on the rule's own declaration block: the selector text alone now
    // also appears inside the two `:has()` conditions above it.
    const body = RULES.slice(
      RULES.indexOf("> :where(form, div) > [data-slot='dialog-body'] { flex: 1 1 auto;"),
    ).slice(0, 500);
    expect(body).toContain('min-block-size: 0;');
    expect(body).toContain('overflow: auto;');
    // Without containment a flick past the end of the body scrolls the page
    // behind the scrim, or starts iOS's own pull-to-refresh, from inside a modal.
    expect(body).toContain('overscroll-behavior: contain;');
  });

  test('keeps the header and the footer out of the scroll', () => {
    expect(RULES).toContain(
      "> :where([data-slot='dialog-header'], [data-slot='dialog-footer']) { flex: 0 0 auto;",
    );
  });

  test('passes the frame through a form or div wrapper, but never through a hidden one', () => {
    // Half the dialogs in the app wrap their slots in the `<form>` they submit
    // through; left as a block box it absorbs the column and the body has no
    // bounded parent to scroll inside.
    expect(RULES).toContain('> :where(form, div):not([hidden]):has(');
    /*
     * `[hidden]` hides through `display: none` in the UA stylesheet, and any
     * author `display` beats it. The new-week dialog keeps its choices mounted
     * and `hidden` while a week generates, so without the guard the frame would
     * put them back on screen underneath the loading state.
     */
    expect(RULES).not.toContain('> :where(form, div):has(');
  });
});

describe('the sheet frame', () => {
  test('bounds every side against the same viewport the dialog uses', () => {
    // `SheetContent` gives its block-axis sides `h-auto` with nothing to stop
    // them, and a `fixed` box pinned to the block-end edge overflows *upward*,
    // where no scrollbar exists.
    expect(RULES).toContain(
      "[data-slot='sheet-content'] { max-block-size: min( var(--q-sheet-max-block, 100dvh), calc(var(--q-viewport-block) - var(--q-sheet-block-gutter, 0px)) );",
    );
  });

  test('lifts a bottom sheet above the keyboard', () => {
    /*
     * The whole rule, not a slice: `[data-side='bottom']` is also selected by
     * the older safe-area block further up the file, so an `indexOf` finds that
     * one and would report a pass or a fail about the wrong declaration.
     */
    expect(RULES).toContain(
      "[data-slot='sheet-content'][data-side='bottom'] { --q-sheet-block-gutter: calc(var(--q-safe-t) + 1.5rem); inset-block-end: var(--q-keyboard-inset); }",
    );
  });

  test('shrinks an inline rail rather than pushing it off the screen', () => {
    // A rail spans the whole block axis, so the keyboard has to come out of its
    // height. `block-size: auto` replaces the `h-full` utility, which would
    // refuse to shrink.
    expect(RULES).toContain('inset-block: 0 var(--q-keyboard-inset); block-size: auto;');
  });

  test('names a scrolling body of its own', () => {
    const body = RULES.slice(RULES.indexOf("[data-slot='sheet-body'] {")).slice(0, 300);
    expect(body).toContain('min-block-size: 0;');
    expect(body).toContain('overflow: auto;');
    expect(body).toContain('overscroll-behavior: contain;');
  });
});

describe('the phone popup sheets', () => {
  test('sit above the keyboard and are measured against what is left of the screen', () => {
    // A combobox is normally opened from a field that already has focus, so the
    // keyboard is up before the list is.
    expect(RULES).toContain('inset-block: auto var(--q-keyboard-inset) !important;');
    expect(RULES).toContain(
      'max-height: min(75dvh, calc(var(--q-viewport-block) - 3rem)) !important;',
    );
  });
});

describe('the call sites the frame replaced', () => {
  /*
   * The whole point of the frame is that a dialog needs no responsive class of
   * its own. These are the five surfaces that had each independently written
   * the same one, plus the three that stated a viewport height by hand — if any
   * of them comes back, the architecture has quietly become a convention again.
   */
  const SURFACES = [
    'features/clients/components/client-form-trigger.tsx',
    'features/clients/components/intake-form-trigger.tsx',
    'features/notifications/components/notifications-bell.tsx',
    'features/requests/components/requests-dialog-trigger.tsx',
    'features/portal/components/appointment-request-dialog.tsx',
    'features/portal/components/data-update-request.tsx',
    'features/weekly-plans/components/dish-editor-dialog.tsx',
    'features/weekly-plans/components/new-week-dialog.tsx',
  ];

  test.each(SURFACES)('%s states no dialog height or frame of its own', async (path) => {
    const code = await codeOf(path);

    expect(code).not.toContain('open:flex');
    expect(code).not.toMatch(/max-h-\[\d+dvh\]/);
    // `sm:max-h-none` would switch the frame's own ceiling off from `sm` up,
    // which is every laptop and every tablet.
    expect(code).not.toContain('max-h-none');
  });

  test('no dialog reaches for a `max-h-` utility the unlayered frame would beat', async () => {
    const code = await codeOf('components/ui/dialog.tsx');
    expect(code).not.toContain('max-h-');
    // The width ceiling is still the component's own; only the height moved.
    expect(code).toContain('max-w-none');
  });
});
