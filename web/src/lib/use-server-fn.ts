/**
 * Helper to wrap server functions for TanStack Start / React Router client callers.
 * Ensures compatibility across client SPA and SSR runtimes without runtime reference errors.
 */
export function useServerFn<T>(fn: T): T {
  return fn;
}
