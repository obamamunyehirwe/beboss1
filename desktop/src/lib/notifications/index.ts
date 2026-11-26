import { notificationStore } from "./store";
import { playNotificationChime, showOsNotification } from "./native";
import type { NotificationInput, NotificationItem } from "./types";

export type { NotificationCategory, NotificationInput, NotificationItem, NotificationSeverity, NotificationSettings, NotificationSnapshot, NotificationAction } from "./types";
export { notificationStore, useNotifications } from "./store";
export { focusMainWindow, osNotificationPermission, playNotificationChime, requestOsNotificationPermission, showOsNotification } from "./native";

/**
 * Single entry point used across the desktop app. Persists the item, then
 * raises the real OS notification and chime according to user settings.
 */
export function notify(input: NotificationInput): NotificationItem {
  const item = notificationStore.push(input);
  const settings = notificationStore.getSettings();
  if (!item.read) {
    if (settings.soundEnabled) playNotificationChime(item.severity);
    if (settings.osEnabled) {
      showOsNotification(item.title, item.body ?? "", { category: item.category, severity: item.severity });
    }
  }
  return item;
}

/** Fire-and-forget helper for event handlers that cannot await. */
export function notifyAsync(input: NotificationInput): void {
  void notify(input);
}