export type NotificationState = {
  read: string[];
  deleted: string[];
};

export const EMPTY_NOTIFICATION_STATE: NotificationState = { read: [], deleted: [] };

function stringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === 'string'))];
}

export function parseNotificationState(raw: string | null): NotificationState {
  if (!raw) return EMPTY_NOTIFICATION_STATE;

  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== 'object') return EMPTY_NOTIFICATION_STATE;

    const candidate = value as Partial<NotificationState>;
    return {
      read: stringIds(candidate.read),
      deleted: stringIds(candidate.deleted),
    };
  } catch {
    return EMPTY_NOTIFICATION_STATE;
  }
}

export function markNotificationRead(state: NotificationState, id: string): NotificationState {
  if (state.read.includes(id)) return state;
  return { ...state, read: [...state.read, id] };
}

export function deleteNotification(state: NotificationState, id: string): NotificationState {
  if (state.deleted.includes(id)) return state;
  return { ...state, deleted: [...state.deleted, id] };
}

export function notificationView(ids: readonly string[], state: NotificationState) {
  const read = new Set(state.read);
  const deleted = new Set(state.deleted);
  const visibleIds = ids.filter((id) => !deleted.has(id));

  return {
    visibleIds,
    unreadCount: visibleIds.filter((id) => !read.has(id)).length,
  };
}
