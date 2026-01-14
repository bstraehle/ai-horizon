// @ts-check
import { describe, it, expect } from "vitest";
import { Bullet } from "../js/entities/Bullet.js";
import { Star } from "../js/entities/Star.js";
import { Asteroid } from "../js/entities/Asteroid.js";

describe("Bullet entity", () => {
  it("constructs with correct initial properties", () => {
    const bullet = new Bullet(10, 20, 4, 10, 500);
    expect(bullet.x).toBe(10);
    expect(bullet.y).toBe(20);
    expect(bullet.width).toBe(4);
    expect(bullet.height).toBe(10);
    expect(bullet.speed).toBe(500);
    expect(bullet.style).toBe("normal");
  });

  it("update moves bullet upward (negative y)", () => {
    const bullet = new Bullet(10, 100, 4, 10, 500);
    bullet.update(0.1);
    expect(bullet.y).toBe(50);
  });

  it("getBounds returns correct bounding box", () => {
    const bullet = new Bullet(10, 20, 4, 10, 500);
    const bounds = bullet.getBounds();
    expect(bounds).toEqual({ x: 10, y: 20, width: 4, height: 10 });
  });

  it("reset reinitializes bullet state", () => {
    const bullet = new Bullet(10, 20, 4, 10, 500);
    bullet.reset(50, 60, 6, 12, 600, "upgraded");
    expect(bullet.x).toBe(50);
    expect(bullet.y).toBe(60);
    expect(bullet.width).toBe(6);
    expect(bullet.height).toBe(12);
    expect(bullet.speed).toBe(600);
    expect(bullet.style).toBe("upgraded");
  });

  it("reset defaults style to normal", () => {
    const bullet = new Bullet(10, 20, 4, 10, 500);
    bullet.style = "upgraded";
    bullet.reset(50, 60, 6, 12, 600);
    expect(bullet.style).toBe("normal");
  });
});

describe("Star entity", () => {
  it("constructs with correct initial properties", () => {
    const star = new Star(10, 20, 15, 15, 100, false);
    expect(star.x).toBe(10);
    expect(star.y).toBe(20);
    expect(star.width).toBe(15);
    expect(star.height).toBe(15);
    expect(star.speed).toBe(100);
    expect(star.isRed).toBe(false);
  });

  it("constructs red star variant", () => {
    const star = new Star(10, 20, 15, 15, 100, true);
    expect(star.isRed).toBe(true);
  });

  it("update moves star downward (positive y)", () => {
    const star = new Star(10, 20, 15, 15, 100);
    star.update(0.5);
    expect(star.y).toBe(70);
  });

  it("getBounds returns correct bounding box", () => {
    const star = new Star(10, 20, 15, 15, 100);
    const bounds = star.getBounds();
    expect(bounds).toEqual({ x: 10, y: 20, width: 15, height: 15 });
  });

  it("reset reinitializes star state", () => {
    const star = new Star(10, 20, 15, 15, 100, false);
    star.reset(50, 60, 20, 20, 150, true);
    expect(star.x).toBe(50);
    expect(star.y).toBe(60);
    expect(star.width).toBe(20);
    expect(star.height).toBe(20);
    expect(star.speed).toBe(150);
    expect(star.isRed).toBe(true);
  });

  it("reset defaults isRed to false", () => {
    const star = new Star(10, 20, 15, 15, 100, true);
    star.reset(50, 60, 20, 20, 150);
    expect(star.isRed).toBe(false);
  });
});

describe("Asteroid entity", () => {
  const mockRng = { nextFloat: () => 0.5 };

  it("constructs with correct initial properties", () => {
    const asteroid = new Asteroid(10, 20, 30, 30, 100, mockRng, false);
    expect(asteroid.x).toBe(10);
    expect(asteroid.y).toBe(20);
    expect(asteroid.width).toBe(30);
    expect(asteroid.height).toBe(30);
    expect(asteroid.isHardened).toBe(false);
    expect(asteroid.isBonus).toBe(false);
  });

  it("constructs hardened asteroid variant", () => {
    const asteroid = new Asteroid(10, 20, 30, 30, 100, mockRng, true);
    expect(asteroid.isHardened).toBe(true);
  });

  it("update moves asteroid downward (positive y)", () => {
    const asteroid = new Asteroid(10, 20, 30, 30, 100, mockRng, false);
    const initialY = asteroid.y;
    asteroid.update(0.5);
    expect(asteroid.y).toBeGreaterThan(initialY);
  });

  it("getBounds returns correct bounding box", () => {
    const asteroid = new Asteroid(10, 20, 30, 30, 100, mockRng, false);
    const bounds = asteroid.getBounds();
    expect(bounds).toEqual({ x: 10, y: 20, width: 30, height: 30 });
  });

  it("reset reinitializes asteroid state", () => {
    const asteroid = new Asteroid(10, 20, 30, 30, 100, mockRng, false);
    asteroid.isBonus = true;
    asteroid.reset(50, 60, 40, 40, 150, mockRng, true);
    expect(asteroid.x).toBe(50);
    expect(asteroid.y).toBe(60);
    expect(asteroid.width).toBe(40);
    expect(asteroid.height).toBe(40);
    expect(asteroid.isHardened).toBe(true);
    expect(asteroid.isBonus).toBe(false);
  });

  it("generates craters on construction", () => {
    const asteroid = new Asteroid(10, 20, 50, 50, 100, mockRng, false);
    expect(asteroid._craters).toBeDefined();
    expect(asteroid._craters.length).toBeGreaterThan(0);
  });

  it("hardened asteroid tracks hits", () => {
    const asteroid = new Asteroid(10, 20, 50, 50, 100, mockRng, true);
    expect(asteroid._hits).toBe(0);
  });
});
