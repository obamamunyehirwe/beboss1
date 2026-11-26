export type NotificationCategory =
  | "system"
  | "sync"
  | "security"
  | "billing"
  | "stock"
  | "announcement";

export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export interface NotificationAction {
  label: string;
  onClick: () => void;
}

export interface NotificationItem {
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body?: string;
  createdAt: number;
  read: boolean;
  dedupeKey?: string;
  actions?: NotificationAction[];
}

export interface NotificationSettings {
  osEnabled: boolean;
  soundEnabled: boolean;
  retentionDays: number;
}

export interface NotificationInput {
  category?: NotificationCategory;
  severity?: NotificationSeverity;
  title: string;
  body?: string;
  dedupeKey?: string;
  actions?: NotificationAction[];
}

export interface NotificationSnapshot {
  items: NotificationItem[];
  settings: NotificationSettings;
  unreadCount: number;
}