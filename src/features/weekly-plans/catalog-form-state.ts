/**
 * Action-state shapes for the dish-catalog editor. Separate from the actions
 * module because a "use server" file may only export async functions (same split
 * as form-state.ts).
 */
export type CatalogFormState =
  | { status: 'idle' }
  | { status: 'done'; dishId?: string }
  | {
      status: 'error';
      messageKey: 'errors.invalid' | 'errors.notFound' | 'errors.inUse' | 'errors.unexpected';
    };

export const initialCatalogFormState: CatalogFormState = { status: 'idle' };
