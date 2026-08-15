import { describe, expect, test } from 'bun:test';

import {
  deleteNotification,
  markNotificationRead,
  notificationView,
  parseNotificationState,
} from './browser-state';

describe('browser notification state', () => {
  test('marks one opened notification as read without reading the rest', () => {
    const state = markNotificationRead(parseNotificationState(null), 'client-a-no-plan');

    expect(notificationView(['client-a-no-plan', 'client-b-no-visit'], state)).toEqual({
      visibleIds: ['client-a-no-plan', 'client-b-no-visit'],
      unreadCount: 1,
    });
  });

  test('deletes one notification while preserving the remaining unread count', () => {
    const state = deleteNotification(parseNotificationState(null), 'client-a-no-plan');

    expect(notificationView(['client-a-no-plan', 'client-b-no-visit'], state)).toEqual({
      visibleIds: ['client-b-no-visit'],
      unreadCount: 1,
    });
  });

  test('counts reads and deletions beyond the four-row bell preview', () => {
    const ids = ['one', 'two', 'three', 'four', 'five'];
    const read = markNotificationRead(parseNotificationState(null), 'five');
    const deleted = deleteNotification(read, 'five');

    expect(notificationView(ids, read)).toEqual({ visibleIds: ids, unreadCount: 4 });
    expect(notificationView(ids, deleted)).toEqual({
      visibleIds: ['one', 'two', 'three', 'four'],
      unreadCount: 4,
    });
  });

  test('normalizes malformed browser data instead of hiding notifications', () => {
    expect(parseNotificationState('{"read":["ok",4,"ok"],"deleted":"everything"}')).toEqual({
      read: ['ok'],
      deleted: [],
    });
    expect(parseNotificationState('not-json')).toEqual({ read: [], deleted: [] });
  });
});
