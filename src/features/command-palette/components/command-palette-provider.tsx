'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ClientFormDialog } from '@/features/clients/components/client-form-dialog';
import { DishEditorDialog } from '@/features/weekly-plans/components/dish-editor-dialog';
import { type Locale } from '@/i18n/routing';

import { CommandPalette } from './command-palette';

type CommandPaletteValue = {
  /** Opens the palette. The only thing a caller may do to it. */
  open: () => void;
};

/**
 * `null` when there is no provider above, rather than a thrown error.
 *
 * `AppShell` is shared with the client portal, which has no palette and no
 * business gaining one — the portal is five screens on a phone with a tab bar
 * across the bottom. A control that wants to open the palette therefore has to
 * be able to ask whether there is one, which a context that threw would make
 * unaskable. The same reasoning, and the same shape, as `GuideContext`.
 */
const CommandPaletteContext = createContext<CommandPaletteValue | null>(null);

export function useCommandPalette(): CommandPaletteValue | null {
  return useContext(CommandPaletteContext);
}

/**
 * The palette's one instance, its shortcut, and the client card it can open.
 *
 * ## Why the cards are here and not in the palette
 *
 * Choosing "New subscriber" or "Add dish" closes the palette, and a dialog
 * rendered *inside* the palette would be unmounted by the same state change
 * that dismissed it — the card would flash and vanish. Held here, they outlive
 * the surface that asked for them: the palette closes, the card opens over the
 * page underneath, and the two animations do not fight.
 *
 * ## Where this goes in the tree
 *
 * Inside `GuideProvider` and outside `AppShell`. The palette offers the guided
 * tour as a command, so it has to be able to read `GuideContext`; and the rail's
 * trigger has to be able to read *this* context, so this must be above the
 * shell that renders the rail.
 */
export function CommandPaletteProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [newClient, setNewClient] = useState(false);
  const [newDish, setNewDish] = useState(false);

  /**
   * Counts openings, and keys the palette below.
   *
   * **This is how the palette resets.** A stale query and its results are the
   * wrong thing to greet a reader with — the palette is a place you pass
   * through, not one you come back to — and clearing them in an effect on
   * `open` would be exactly the cascading `setState` the app's lint rules
   * refuse. Bumping a key instead throws the old instance away and mounts a
   * fresh one, which arrives with an empty field by construction.
   *
   * It increments only on the way *in*, so the closing animation still runs on
   * the instance that has the rows to draw.
   */
  const [opening, setOpening] = useState(0);

  const close = useCallback(() => setOpen(false), []);

  const openPalette = useCallback(() => {
    setOpening((count) => count + 1);
    setOpen(true);
  }, []);

  /*
   * ⌘K on a Mac, Ctrl+K everywhere else — the shortcut this pattern has had
   * since it escaped the text editor, and the one a reader will try first.
   *
   * **`preventDefault` is not optional.** Firefox binds Ctrl+K to its own
   * search bar and Chrome binds ⌘K to the address bar's search mode; without
   * this the browser wins and the palette never opens.
   *
   * It does not collide with the rail: `SidebarProvider` takes ⌘B for the fold
   * (see `SIDEBAR_KEYBOARD_SHORTCUT`), which is the one other global chord in
   * the app.
   *
   * Bound on `window` rather than on a container because it has to work from
   * anywhere on the page, including from inside the rail's own controls.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'k' && event.key !== 'K') return;
      if (!event.metaKey && !event.ctrlKey) return;

      event.preventDefault();
      if (open) close();
      else openPalette();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, open, openPalette]);

  const value = useMemo<CommandPaletteValue>(() => ({ open: openPalette }), [openPalette]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}

      <CommandPalette
        key={opening}
        locale={locale}
        open={open}
        onClose={close}
        onNewClient={() => setNewClient(true)}
        onNewDish={() => setNewDish(true)}
      />

      <ClientFormDialog
        locale={locale}
        open={newClient}
        onClose={() => setNewClient(false)}
      />

      {/*
        The catalog's own dish builder, opened from anywhere.

        Unlike the client card this needed no extraction — `AddDishButton`
        already kept the dialog in a component of its own taking `open` and
        `onOpenChange`, so the palette composes exactly what the catalog
        toolbar does.

        No `router.refresh()` on save. The catalog refreshes itself after its
        own button saves because the reader is standing on the list the new dish
        belongs to; from the palette they are somewhere else entirely, and
        re-fetching the screen they are actually looking at would be a page
        flashing for a change that is not on it.
      */}
      <DishEditorDialog
        locale={locale}
        open={newDish}
        onOpenChange={setNewDish}
        onSaved={() => setNewDish(false)}
      />
    </CommandPaletteContext.Provider>
  );
}
