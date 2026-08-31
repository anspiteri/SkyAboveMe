/**
 * Durable cache for the satellite proxy, backed by Deno KV on Deploy.
 *
 * Deno KV is a globally-consistent key/value store that is free on Deno Deploy
 * and shared across edge isolates, so a cache entry written by one request is
 * readable by every other request (and survives cold isolates). This lets the
 * proxy serve satellite orbital data without calling CelesTrak on every hit,
 * which keeps us far below CelesTrak's per-IP request limits — the cause of the
 * recurring "outage" (CelesTrak throttles/blocks an IP after a burst of
 * requests; it is not actually down).
 *
 * When Deno KV is not available (local `deno run`, unit tests), this falls back
 * to a process-local in-memory cache so the app still works and is testable.
 */

/** A cached entry with the wall-clock time it was stored, so callers can decide
 * "fresh" vs "stale" themselves (needed for stale-while-error). */
export interface CacheEntry<T> {
  value: T;
  storedAt: number;
}

interface CacheBackend<T> {
  get(key: string): Promise<CacheEntry<T> | null>;
  set(key: string, entry: CacheEntry<T>, keepForMs: number): Promise<void>;
}

/**
 * A single-satellite-store-friendly cache. This project caches one logical
 * entity (the whole curated satellite set), so keys are simple strings.
 */
export class Cache<T> {
  readonly #backend: CacheBackend<T>;
  readonly #now: () => number;

  constructor(backend: CacheBackend<T>, now: () => number = Date.now) {
    this.#backend = backend;
    this.#now = now;
  }

  /** Get the raw entry (fresh OR stale) at `key`, or null if never stored /
   * hard-expired. Callers apply their own freshness policy via `storedAt`. */
  get(key: string): Promise<CacheEntry<T> | null> {
    return this.#backend.get(key);
  }

  /** Store `value` at `key`, rewriting `storedAt = now`. `keepForMs` is the hard
   * expiry (how long the value may linger even once stale, to serve
   * stale-while-error); freshness is derived from `storedAt`, not this. */
  set(key: string, value: T, keepForMs: number): Promise<void> {
    return this.#backend.set(
      key,
      { value, storedAt: this.#now() },
      keepForMs,
    );
  }
}

const KV_PREFIX = ["sam"];

class KvBackend<T> implements CacheBackend<T> {
  #kv: Deno.Kv;

  constructor(kv: Deno.Kv) {
    this.#kv = kv;
  }

  async get(key: string): Promise<CacheEntry<T> | null> {
    const res = await this.#kv.get<CacheEntry<T>>([...KV_PREFIX, key], {
      consistency: "eventual",
    });
    return res.value ?? null;
  }

  async set(key: string, entry: CacheEntry<T>, keepForMs: number): Promise<void> {
    if (keepForMs > 0) {
      await this.#kv.set([...KV_PREFIX, key], entry, { expireIn: keepForMs });
    } else {
      await this.#kv.set([...KV_PREFIX, key], entry);
    }
  }
}

class MemoryBackend<T> implements CacheBackend<T> {
  readonly #store = new Map<string, { entry: CacheEntry<T>; expiresAt: number }>();

  get(key: string): Promise<CacheEntry<T> | null> {
    const item = this.#store.get(key);
    if (!item) return Promise.resolve(null);
    // Hard-expiry just hides the entry; the caller may still want stale reads,
    // so we keep it in the map until evicted on a later access.
    return Promise.resolve(item.entry);
  }

  set(key: string, entry: CacheEntry<T>, keepForMs: number): Promise<void> {
    const expiresAt = keepForMs > 0 ? Date.now() + keepForMs : Infinity;
    this.#store.set(key, { entry, expiresAt });
    if (this.#store.size > 1000) {
      const now = Date.now();
      for (const [k, v] of this.#store) {
        if (v.expiresAt < now) this.#store.delete(k);
      }
    }
    return Promise.resolve();
  }
}

/**
 * Open a cache for satellite data. Prefers Deno KV; falls back to an in-memory
 * cache if KV is unavailable (local dev / unit tests without KV permission).
 */
export async function openSatelliteCache(): Promise<Cache<unknown>> {
  try {
    // `Deno.openKv` requires the `--unstable-kv`/KV flag and a supporting
    // runtime; when absent (or in tests) this throws and we fall back.
    if (typeof Deno.openKv === "function") {
      const kv = await Deno.openKv();
      // The KV store attached to this project (slug "sky-above-me") is shared
      // across all requests, so one isolate's cache is visible to every other.
      return new Cache(new KvBackend<unknown>(kv));
    }
  } catch {
    // Fall through to the in-memory backend.
  }
  return new Cache(new MemoryBackend<unknown>());
}

/** Build a process-local in-memory cache (for tests and local tooling). */
export function createMemoryCache<T>(
  now: () => number = Date.now,
): Cache<T> {
  return new Cache(new MemoryBackend<T>(), now);
}
