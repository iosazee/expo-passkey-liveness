import {
  inMemoryReplayStore,
  redisReplayStore,
  type RedisLike,
} from "../replay-store";
import type { LivenessReplayStore } from "../../../types/liveness";

function fakeRedis(): RedisLike & { _store: Map<string, number> } {
  const store = new Map<string, number>();
  return {
    _store: store,
    async set(key, _value, _mode, _exp, seconds) {
      if (store.has(key)) {
        return null;
      }
      store.set(key, seconds);
      return "OK";
    },
  };
}

interface Variant {
  name: string;
  build: () => {
    store: LivenessReplayStore;
    dispose?: () => void;
  };
}

const variants: Variant[] = [
  {
    name: "inMemoryReplayStore",
    build: () => {
      const store = inMemoryReplayStore({ cleanupIntervalMs: 0 });
      return { store, dispose: () => store.dispose() };
    },
  },
  {
    name: "redisReplayStore",
    build: () => {
      const client = fakeRedis();
      return { store: redisReplayStore(client) };
    },
  },
];

describe.each(variants)("$name", ({ build }) => {
  test("records an unseen jti and detects it on the next get", async () => {
    const { store, dispose } = build();
    try {
      const exp = Math.floor(Date.now() / 1000) + 300;
      const seenBefore = await store.get("jti-a");
      expect(seenBefore).toBe(false);

      await store.set("jti-a", exp);

      const seenAfter = await store.get("jti-a");
      expect(seenAfter).toBe(true);
    } finally {
      dispose?.();
    }
  });

  test("treats independent jtis independently", async () => {
    const { store, dispose } = build();
    try {
      const exp = Math.floor(Date.now() / 1000) + 300;
      await store.set("jti-a", exp);
      expect(await store.get("jti-b")).toBe(false);
    } finally {
      dispose?.();
    }
  });
});

describe("inMemoryReplayStore — expiry-specific behaviour", () => {
  test("evicts entries past their expiry on get", async () => {
    let clock = 1000;
    const store = inMemoryReplayStore({
      cleanupIntervalMs: 0,
      now: () => clock,
    });

    try {
      await store.set("jti-a", 1100);
      clock = 1050;
      expect(await store.get("jti-a")).toBe(true);

      clock = 1200;
      expect(await store.get("jti-a")).toBe(false);
    } finally {
      store.dispose();
    }
  });
});
