import { describe, it, expect } from "vitest";
import {
  coverCrop,
  blurPixels,
  blurMatches,
  appearanceReady,
  blurredPath,
  referencedAssets,
  opacity,
} from "../src/background";
import { freshConfig, parseConfig } from "../src/config";
import { themeStyle } from "../src/theme";
describe("prepared backgrounds", () => {
  it("covers 800x480 without distortion, cropping the sides of a wide image", () => {
    const crop = coverCrop(4000, 1000);
    expect(crop.scale).toBe(0.48);
    expect(crop.x).toBeCloseTo(1166.666667);
    expect(crop.width).toBeCloseTo(1666.666667);
    expect(crop.y).toBe(0);
    expect(crop.height).toBe(1000);
    expect(crop.width * crop.scale).toBe(800);
    expect(crop.height * crop.scale).toBe(480);
  });
  it("handles portrait, matching and smaller images proportionally", () => {
    expect(coverCrop(800, 480)).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 480,
      scale: 1,
    });
    expect(coverCrop(1000, 4000).y).toBe(1700);
    expect(coverCrop(400, 240).scale).toBe(2);
    expect(() => coverCrop(0, 100)).toThrow();
  });
  it("leaves constant colors unchanged and smooths edges without transparent halos", () => {
    const solid = Uint8ClampedArray.from([
      10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255,
    ]);
    expect(blurPixels(solid, 3, 1, 12)).toEqual(solid);
    const edge = Uint8ClampedArray.from([
      0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255,
    ]);
    const blurred = blurPixels(edge, 3, 1, 4);
    expect(blurred[0]).toBeGreaterThan(0);
    expect(blurred[4]).toBeLessThan(255);
    expect([blurred[3], blurred[7], blurred[11]]).toEqual([255, 255, 255]);
  });
  it("retains prepared assets across presets and validates optional fields", () => {
    const c = freshConfig();
    c.theme = {
      ...c.theme,
      background_mode: "image",
      background_image: "/backgrounds/a.jpg",
      background_blur_image: "/backgrounds/a-blur-8.jpg",
      button_blur: 8,
      button_opacity: 100,
    };
    c.theme_presets.Custom = {
      ...c.theme,
      background_image: "/backgrounds/b.jpg",
    };
    expect(parseConfig(JSON.stringify(c))).toEqual(c);
    expect(referencedAssets(c).has("/backgrounds/b.jpg")).toBe(true);
    expect(appearanceReady(c.theme)).toBe(true);
    c.theme.button_blur = 12;
    expect(appearanceReady(c.theme)).toBe(false);
    expect(blurredPath("/backgrounds/a.jpg", 12)).toBe(
      "/backgrounds/a-blur-12.jpg",
    );
    for (const patch of [
      { button_blur: 25 },
      { button_opacity: -1 },
      { background_image: "/backgrounds/../bad.jpg" },
    ])
      expect(() =>
        parseConfig(JSON.stringify({ ...c, theme: { ...c.theme, ...patch } })),
      ).toThrow();
  });
  it("keeps legacy opacity and exposes only colors as device color variables", () => {
    const t = freshConfig().theme;
    expect(opacity(t)).toBe(160);
    t.button_opacity = 0;
    t.background_mode = "image";
    const style = themeStyle(t);
    expect(style["--button-alpha"]).toBe("0");
    expect(style["--device-background_mode"]).toBeUndefined();
  });
});

it("distinguishes cached blur variants without overwriting an asset used by another preset", () => {
  expect(
    blurMatches("/backgrounds/a.jpg", 8, "/backgrounds/a-blur-8-unique.jpg"),
  ).toBe(true);
  expect(
    blurMatches("/backgrounds/a.jpg", 8, "/backgrounds/a-blur-18-unique.jpg"),
  ).toBe(false);
  expect(
    blurMatches("/backgrounds/b.jpg", 8, "/backgrounds/a-blur-8-unique.jpg"),
  ).toBe(false);
});
