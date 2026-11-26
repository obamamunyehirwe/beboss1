import type { NotificationSeverity } from "./types";

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioContext) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioContext = new Ctor();
    }
    if (audioContext.state === "suspended") void audioContext.resume();
    return audioContext;
  } catch {
    return null;
  }
}

/** Short, synthesized two-tone chime. No audio assets or network required. */
export function playNotificationChime(severity: NotificationSeverity): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const notes: Array<[number, number]> =
      severity === "critical" || severity === "warning"
        ? [[660, 0], [520, 0.14]]
        : severity === "success"
          ? [[620, 0], [880, 0.12]]
          : [[740, 0]];
    notes.forEach(([frequency, offset]) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.08, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.24);
    });
  } catch {
    // Audio is best-effort; a blocked audio context must never break the app.
  }
}

export function osNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestOsNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

export interface OsNotificationOptions {
  category?: string;
  severity?: NotificationSeverity;
  onClick?: () => void;
}

/** Real native OS toast through the WebView notification stack. */
export function showOsNotification(title: string, body: string, options: OsNotificationOptions = {}): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  try {
    const notification = new Notification(title, {
      body,
      icon: "/beboss-app-icon.png",
      badge: "/favicon.png",
      tag: options.category ? "beboss-" + options.category : "beboss",
      silent: true,
    } as NotificationOptions);
    notification.onclick = () => {
      try {
        window.focus();
        window.dispatchEvent(new CustomEvent("beboss:notification-open"));
      } catch {
        // Ignore focus failures in embedded webviews.
      }
      options.onClick?.();
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}

/** Bring the BeBoss main window to the foreground after a notification click. */
export async function focusMainWindow(): Promise<void> {
  try {
    if (!window.beBossDesktop?.isNative) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const appWindow = getCurrentWindow();
    await appWindow.show();
    await appWindow.unminimize();
    await appWindow.setFocus();
  } catch {
    // Window management is best-effort outside the native runtime.
  }
}