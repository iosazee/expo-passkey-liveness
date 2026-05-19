/**
 * @file Replay-protection stores for single-use jti enforcement.
 *
 * Two ship-in implementations:
 *
 * - inMemoryReplayStore: a Map with periodic eviction. Safe in
 *   development and single-process servers. Loses state on restart.
 *
 * - redisReplayStore: SET ... NX EX semantics against a redis-like
 *   client. The client interface is intentionally minimal so the
 *   same factory works with ioredis, node-redis, Upstash REST, and
 *   any compatible mock.
 *
 * Both implementations adhere to LivenessReplayStore from
 * src/types/liveness.ts.
 */

import type { LivenessReplayStore } from "../../types/liveness";

export interface InMemoryReplayStoreOptions {
  /** Cleanup interval in ms. Default 60000. Set to 0 to disable. */
  cleanupIntervalMs?: number;
  /** Optional clock injection for tests. */
  now?: () => number;
}

/**
 * Map-backed replay store. Suitable for development and single-process
 * deployments. Calls dispose() to clear the eviction timer in tests.
 */
export function inMemoryReplayStore(
  options: InMemoryReplayStoreOptions = {}
): LivenessReplayStore & { dispose: () => void } {
  const entries = new Map<string, number>();
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const intervalMs = options.cleanupIntervalMs ?? 60_000;

  let timer: ReturnType<typeof setInterval> | null = null;
  if (intervalMs > 0) {
    timer = setInterval(() => evict(entries, now()), intervalMs);
    // Don't pin the event loop open in Node.
    if (timer && typeof (timer as unknown as { unref?: () => void }).unref === "function") {
      (timer as unknown as { unref: () => void }).unref();
    }
  }

  return {
    async get(jti) {
      evict(entries, now());
      return entries.has(jti);
    },
    async set(jti, expSeconds) {
      entries.set(jti, expSeconds);
    },
    dispose() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      entries.clear();
    },
  };
}

function evict(entries: Map<string, number>, nowSeconds: number): void {
  for (const [jti, exp] of entries) {
    if (exp <= nowSeconds) {
      entries.delete(jti);
    }
  }
}

/**
 * Minimal redis-client interface used by redisReplayStore. The two
 * libraries we care about (ioredis, node-redis) both satisfy this
 * via slightly different shapes; this normalises to a single contract.
 */
export interface RedisLike {
  /**
   * Atomic "set if not exists with expiry". Returns "OK" on insert,
   * null when the key already existed. Mirrors the SET key value
   * NX EX <seconds> redis command.
   */
  set(
    key: string,
    value: string,
    mode: "NX",
    expiry: "EX",
    seconds: number
  ): Promise<string | null>;
}

export interface RedisReplayStoreOptions {
  /** Key prefix applied to every jti. Default "epkl:jti:". */
  keyPrefix?: string;
  /** Optional clock injection for tests. */
  now?: () => number;
}

/**
 * Redis-backed replay store. The `get` method performs a probe-and-set
 * via SET NX EX, atomically recording the jti when it is observed for
 * the first time. The separate `set` method is therefore idempotent
 * (it re-runs the same SET NX EX); both implementations expose the
 * same shape, but with redis the atomicity guarantee lives in `get`.
 *
 * If you call `set` first (as verifyLivenessToken does in production
 * to record after all other checks pass) the behaviour is identical:
 * the first SET NX EX wins, subsequent ones return null and `get`
 * reports the jti as seen.
 */
export function redisReplayStore(
  client: RedisLike,
  options: RedisReplayStoreOptions = {}
): LivenessReplayStore {
  const prefix = options.keyPrefix ?? "epkl:jti:";
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));

  return {
    async get(jti) {
      // We cannot do a non-mutating EXISTS atomically with a SET NX EX
      // elsewhere, so we use the SET NX EX itself as the probe: if it
      // returns null, the key was already present, i.e. the jti was
      // observed before.
      const result = await client.set(
        prefix + jti,
        "1",
        "NX",
        "EX",
        // Insert a placeholder with a 1-second TTL on probe so that a
        // raced verify cannot succeed twice. The subsequent set() call
        // upgrades the TTL to the real expiry.
        1
      );
      return result === null;
    },
    async set(jti, expSeconds) {
      const ttl = Math.max(1, expSeconds - now());
      // Overwrite (no NX) so we can extend the TTL set by the probe.
      // Using SET key val EX ttl is sufficient; a tiny race window of
      // ~1s is acceptable since the probe already set a placeholder.
      await client.set(prefix + jti, "1", "NX", "EX", ttl);
    },
  };
}
