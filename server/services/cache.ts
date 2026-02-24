/**
 * Simple in-memory cache with TTL support.
 * Avoids hitting the database on every request for hot endpoints.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<any>>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidatePattern(prefix: string): void {
    const keysToDelete: string[] = [];
    this.store.forEach((_, key) => {
      if (key.startsWith(prefix)) keysToDelete.push(key);
    });
    keysToDelete.forEach(key => this.store.delete(key));
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    this.store.forEach((entry, key) => {
      if (now > entry.expiresAt) keysToDelete.push(key);
    });
    keysToDelete.forEach(key => this.store.delete(key));
  }

  stats(): { size: number; keys: string[] } {
    return { size: this.store.size, keys: Array.from(this.store.keys()) };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

// TTL constants
export const CACHE_TTL = {
  DROPS: 3 * 60 * 1000,       // 3 minutes for product listing
  PRODUCT: 5 * 60 * 1000,     // 5 minutes for single product
  SEARCH: 2 * 60 * 1000,      // 2 minutes for search results
  TRUST_SCORE: 30 * 60 * 1000, // 30 minutes for trust scores
  ARTICLES: 60 * 60 * 1000,   // 1 hour for articles
  ANALYTICS: 10 * 60 * 1000,  // 10 minutes for analytics
  DIGEST: 30 * 60 * 1000,     // 30 minutes for weekly digest
};

export const cache = new MemoryCache();
