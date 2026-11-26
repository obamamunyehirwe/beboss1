import { useSyncExternalStore } from "react";
import type {
  NotificationInput,
  NotificationItem,
  NotificationSettings,
  NotificationSnapshot,
} from "./types";

const STORAGE_KEY = "beboss-notifications:v1";
const MAX_ITEMS = 200;
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

const DEFAULT_SETTINGS: NotificationSettings = {
  osEnabled: false,
  soundEnabled: true,
  retentionDays: 30,
};

type Listener = () => void;

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "n-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function prune(items: NotificationItem[], retentionDays: number): NotificationItem[] {
  const cutoff = Date.now() - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000;
  return items.filter((item) => item.createdAt >= cutoff);
}

function loadPersisted(): { items: NotificationItem[]; settings: NotificationSettings } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [], settings: { ...DEFAULT_SETTINGS } };
    const parsed = JSON.parse(raw) as { items?: NotificationItem[]; settings?: Partial<NotificationSettings> };
    const settings: NotificationSettings = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) };
    const items = Array.isArray(parsed.items)
      ? prune(parsed.items.filter((item) => item && typeof item.id === "string" && typeof item.title === "string"), settings.retentionDays)
      : [];
    return { items, settings };
  } catch {
    return { items: [], settings: { ...DEFAULT_SETTINGS } };
  }
}

class NotificationStore {
  private items: NotificationItem[] = [];
  private settings: NotificationSettings = { ...DEFAULT_SETTINGS };
  private listeners = new Set<Listener>();
  private snapshot: NotificationSnapshot;

  constructor() {
    const persisted = loadPersisted();
    this.items = persisted.items;
    this.settings = persisted.settings;
    this.snapshot = this.buildSnapshot();
  }

  private buildSnapshot(): NotificationSnapshot {
    return {
      items: this.items,
      settings: this.settings,
      unreadCount: this.items.reduce((count, item) => count + (item.read ? 0 : 1), 0),
    };
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: this.items, settings: this.settings }));
    } catch {
      // Storage can be unavailable in hardened WebView sessions; the in-memory
      // store keeps working for the running session.
    }
  }

  private emit() {
    this.snapshot = this.buildSnapshot();
    this.persist();
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): NotificationSnapshot => this.snapshot;

  push(input: NotificationInput): NotificationItem {
    const now = Date.now();
    if (input.dedupeKey) {
      const existing = this.items.find(
        (item) => item.dedupeKey === input.dedupeKey && !item.read && now - item.createdAt < DEDUPE_WINDOW_MS,
      );
      if (existing) {
        existing.createdAt = now;
        if (input.body) existing.body = input.body;
        this.items = [existing, ...this.items.filter((item) => item.id !== existing.id)];
        this.emit();
        return existing;
      }
    }
    const item: NotificationItem = {
      id: createId(),
      category: input.category ?? "system",
      severity: input.severity ?? "info",
      title: input.title,
      body: input.body,
      createdAt: now,
      read: false,
      dedupeKey: input.dedupeKey,
      actions: input.actions,
    };
    this.items = [item, ...this.items].slice(0, MAX_ITEMS);
    this.emit();
    return item;
  }

  markRead(id: string) {
    const target = this.items.find((item) => item.id === id);
    if (!target || target.read) return;
    target.read = true;
    this.emit();
  }

  markAllRead() {
    if (!this.items.some((item) => !item.read)) return;
    this.items = this.items.map((item) => (item.read ? item : { ...item, read: true }));
    this.emit();
  }

  dismiss(id: string) {
    const next = this.items.filter((item) => item.id !== id);
    if (next.length === this.items.length) return;
    this.items = next;
    this.emit();
  }

  clearAll() {
    if (!this.items.length) return;
    this.items = [];
    this.emit();
  }

  updateSettings(patch: Partial<NotificationSettings>) {
    this.settings = { ...this.settings, ...patch };
    this.items = prune(this.items, this.settings.retentionDays);
    this.emit();
  }

  getSettings(): NotificationSettings {
    return this.settings;
  }
}

export const notificationStore = new NotificationStore();

export function useNotifications(): NotificationSnapshot {
  return useSyncExternalStore(
    notificationStore.subscribe,
    notificationStore.getSnapshot,
    notificationStore.getSnapshot,
  );
}