// @ts-check
import { describe, it, expect } from "vitest";
import { ObjectPool } from "../js/utils/ObjectPool.js";

describe("ObjectPool", () => {
  it("reuses released objects", () => {
    let created = 0;
    const pool = new ObjectPool(
      () => ({ v: 0, id: ++created }),
      (obj, v) => {
        obj.v = v;
      }
    );

    const a = pool.acquire(1);
    const _b = pool.acquire(2);
    expect(created).toBe(2);

    pool.release(a);
    const c = pool.acquire(3);

    // c should be a reused object (either a or b); since we released a once, c should === a
    expect(c).toBe(a);
    expect(created).toBe(2);
    expect(c.v).toBe(3);
  });

  it("hasFree returns true when pool has free objects", () => {
    const pool = new ObjectPool(() => ({ v: 0 }));
    expect(pool.hasFree).toBe(false);
    const a = pool.acquire();
    expect(pool.hasFree).toBe(false);
    pool.release(a);
    expect(pool.hasFree).toBe(true);
  });

  it("remainingCapacity returns correct value", () => {
    const pool = new ObjectPool(() => ({ v: 0 }), undefined, { maxSize: 5 });
    expect(pool.remainingCapacity).toBe(5);
    const a = pool.acquire();
    pool.release(a);
    expect(pool.remainingCapacity).toBe(4);
  });

  it("remainingCapacity returns Infinity when no maxSize", () => {
    const pool = new ObjectPool(() => ({ v: 0 }));
    expect(pool.remainingCapacity).toBe(Number.POSITIVE_INFINITY);
  });

  it("clear() empties the free list", () => {
    const pool = new ObjectPool(() => ({ v: 0 }));
    const a = pool.acquire();
    const b = pool.acquire();
    pool.release(a);
    pool.release(b);
    expect(pool.freeCount).toBe(2);
    pool.clear();
    expect(pool.freeCount).toBe(0);
  });

  it("clear(true) disposes objects when disposer provided", () => {
    const disposed = [];
    const pool = new ObjectPool(() => ({ id: Math.random() }), undefined, {
      dispose: (o) => disposed.push(o.id),
    });
    const a = pool.acquire();
    const b = pool.acquire();
    pool.release(a);
    pool.release(b);
    expect(disposed.length).toBe(0);
    pool.clear(true);
    expect(disposed.length).toBe(2);
    expect(pool.freeCount).toBe(0);
  });

  it("release ignores null/undefined", () => {
    const pool = new ObjectPool(() => ({ v: 0 }));
    pool.release(null);
    pool.release(undefined);
    expect(pool.freeCount).toBe(0);
  });

  it("uses object.reset() method if available", () => {
    let resetCalled = false;
    const pool = new ObjectPool(() => ({
      v: 0,
      reset: (_val) => {
        resetCalled = true;
      },
    }));
    const a = pool.acquire(1);
    pool.release(a);
    resetCalled = false;
    pool.acquire(2);
    expect(resetCalled).toBe(true);
  });
});
