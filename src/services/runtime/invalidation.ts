let version = 0;
const listeners = new Set<() => void>();

/** Shared refresh signal; it has no knowledge of MySQL, fixtures, or adapters. */
export const runtimeInvalidation = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getVersion(): number {
    return version;
  },
  notify(): void {
    version += 1;
    for (const listener of listeners) listener();
  },
};
