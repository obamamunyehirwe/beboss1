export type DesktopShortcutDestination = "overview" | "checkout" | "products" | "sales" | "reports";

const DESTINATIONS: Record<string, DesktopShortcutDestination> = {
  "1": "overview",
  "2": "checkout",
  "3": "products",
  "4": "sales",
  "5": "reports",
};

/** Resolve navigation shortcuts without stealing keystrokes from editable fields. */
export function resolveDesktopNavigationShortcut(
  key: string,
  modifierPressed: boolean,
  shiftPressed: boolean,
  isEditing: boolean,
): DesktopShortcutDestination | null {
  if (!modifierPressed || shiftPressed || isEditing) return null;
  return DESTINATIONS[key.toLowerCase()] ?? null;
}
