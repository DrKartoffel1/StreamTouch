import { describe, it, expect } from "vitest";
import {
  deviceLayout,
  advance,
  textWidth,
  labelLayout,
  containIcon,
} from "../src/device-layout";
import {
  isManagedIcon,
  iconReferenced,
  parseIconList,
} from "../src/icon-library";
import { freshConfig } from "../src/config";
describe("device preview", () => {
  it("matches headless LVGL layout measurements at 800x480 and DPI 130", () => {
    expect(deviceLayout.columns).toEqual([163, 162, 163, 162]);
    expect(
      deviceLayout.columns.reduce((a, b) => a + b, 0) +
        2 * deviceLayout.margin +
        3 * deviceLayout.gap,
    ).toBe(800);
    expect(
      2 * deviceLayout.buttonHeight +
        2 * deviceLayout.margin +
        deviceLayout.gap,
    ).toBe(480);
    expect(textWidth("Button 1")).toBe(100);
    expect(labelLayout("Button 1")).toEqual({
      lines: ["Button 1"],
      width: 100,
      height: 27,
    });
  });
  it("uses native glyph kerning and preserves natural label widths", () => {
    expect(advance("A", "V")).toBeLessThan(advance("A"));
    expect(labelLayout("one\ntwo").height).toBe(54);
    expect(labelLayout("Previous Track")).toEqual({
      lines: ["Previous Track"],
      width: 177,
      height: 27,
    });
  });
  it("never upscales small icons and uses LVGL 1/256 scale increments", () => {
    expect(containIcon(64, 64, 119, 138)).toEqual({ width: 64, height: 64 });
    expect(containIcon(512, 256, 119, 138)).toEqual({ width: 118, height: 59 });
  });
});
describe("icon library boundaries", () => {
  it("validates and sorts listing metadata", () => {
    expect(
      parseIconList({
        version: 1,
        files: [
          { path: "/icons/b.PNG", size: 10, in_use: false },
          { path: "/icons/a.png", size: 20, in_use: true },
        ],
      }).map((f) => f.path),
    ).toEqual(["/icons/a.png", "/icons/b.PNG"]);
    for (const v of [
      { version: 1, files: [{ path: "/macros.json", size: 1, in_use: false }] },
      {
        version: 1,
        files: [{ path: "/icons/a.png", size: -1, in_use: false }],
      },
      { version: 2, files: [] },
    ])
      expect(() => parseIconList(v)).toThrow();
    expect(() => parseIconList({ error: "SD unavailable" })).toThrow(
      "SD unavailable",
    );
  });
  it("protects configuration references and path aliases", () => {
    const c = freshConfig();
    c.tiles[0].icon = "S:/icons/USED.png";
    expect(iconReferenced("/icons/used.png", c)).toBe(true);
    expect(iconReferenced("/icons/unassigned.png", c)).toBe(false);
    for (const path of [
      "/icons/../macros.json",
      "/icons/./a.png",
      "/icons//a.png",
      "/icons/a.png\nGET_JSON",
      "/macros.json",
    ])
      expect(isManagedIcon(path)).toBe(false);
    expect(isManagedIcon("/icons/sub/música.png")).toBe(true);
  });
});
