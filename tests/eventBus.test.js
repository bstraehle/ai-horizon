// @ts-check
import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../js/core/EventBus.js";

describe("EventBus", () => {
  it("subscribes, emits, and unsubscribes", () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();

    const off1 = bus.on("test", h1);
    bus.on("test", h2);

    bus.emit("test", { a: 1 });
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);

    off1();
    bus.emit("test", { a: 2 });
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(2);

    bus.clear("test");
    bus.emit("test", { a: 3 });
    expect(h2).toHaveBeenCalledTimes(2);
  });

  it("clear() without type clears all handlers", () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();

    bus.on("event1", h1);
    bus.on("event2", h2);

    bus.emit("event1", {});
    bus.emit("event2", {});
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);

    bus.clear();

    bus.emit("event1", {});
    bus.emit("event2", {});
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it("emit with no handlers is a no-op", () => {
    const bus = new EventBus();
    expect(() => bus.emit("nonexistent", {})).not.toThrow();
  });

  it("off() is idempotent", () => {
    const bus = new EventBus();
    const h = vi.fn();
    const off = bus.on("test", h);
    off();
    off();
    bus.emit("test", {});
    expect(h).toHaveBeenCalledTimes(0);
  });

  it("passes payload to handlers", () => {
    const bus = new EventBus();
    const h = vi.fn();
    bus.on("test", h);
    const payload = { foo: "bar", num: 42 };
    bus.emit("test", payload);
    expect(h).toHaveBeenCalledWith(payload);
  });
});
