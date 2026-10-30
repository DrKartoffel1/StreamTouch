import { referencedAssets } from "../src/background";
import { iconReferenced } from "../src/icon-library";
import { describe, it, expect } from "vitest";
import { freshConfig, parseConfig, editAction, canonical } from "../src/config";
import { mapKey } from "../src/keys";
import { themeStyle } from "../src/theme";
describe("configuration", () => {
  it("round trips existing presets and unknown fields", () => {
    const c = { ...freshConfig(), extra: { nested: true } };
    c.tiles[0] = {
      label: "Hello",
      custom: 42,
      actions: [
        { type: "keys", keys: ["A"] },
        { type: "media", keys: ["MEDIA_STOP"] },
      ],
    };
    expect(parseConfig(JSON.stringify(c))).toEqual(c);
    expect(editAction(c.tiles[0], { type: "keys", keys: ["B"] })).toMatchObject(
      {
        custom: 42,
        actions: [
          { type: "keys", keys: ["B"] },
          { type: "media", keys: ["MEDIA_STOP"] },
        ],
      },
    );
  });
  it("rejects malformed imports", () => {
    for (const s of [
      "null",
      "[]",
      '{"tiles":[null]}',
      '{"theme":{"icon":"red"}}',
      '{"tiles":[{"icon":"/icons/../bad"}]}',
    ])
      expect(() => parseConfig(s)).toThrow();
  });
  it("fills missing values and compares without key ordering", () => {
    expect(parseConfig("{}").tiles).toHaveLength(8);
    expect(canonical({ a: 1, b: 2 })).toBe(canonical({ b: 2, a: 1 }));
  });
  it("maps browser codes to firmware names", () => {
    expect(mapKey({ code: "ControlRight", key: "Control" })).toBe("RIGHT_CTRL");
    expect(mapKey({ code: "KeyQ", key: "a" })).toBe("Q");
    expect(mapKey({ code: "F24", key: "F24" })).toBe("F24");
    expect(mapKey({ code: "AudioVolumeUp", key: "" })).toBeNull();
  });
  it("derives readable chrome without modifying preview colors", () => {
    const c = freshConfig();
    c.theme.background = "#ffffff";
    const s = themeStyle(c.theme);
    expect(s["--workspace-text"]).toBe("#000000");
    expect(s["--device-icon"]).toBe(c.theme.icon);
  });
});

it("keeps workspace accents visible when device colors have no contrast", () => {
  const theme = freshConfig().theme;
  theme.background = "#000000";
  theme.icon = "#000000";
  const style = themeStyle(theme);
  expect(style["--accent"]).not.toBe("#000000");
  expect(style["--device-icon"]).toBe("#000000");
});

it("accepts existing empty and Unicode icon names without accepting protocol delimiters", () => {
  expect(
    parseConfig(
      JSON.stringify({ tiles: [{ icon: "" }, { icon: "/icons/Música.png" }] }),
    ).tiles[1].icon,
  ).toBe("/icons/Música.png");
  expect(() =>
    parseConfig(JSON.stringify({ tiles: [{ icon: "/icons/a\nGET_JSON" }] })),
  ).toThrow("Invalid icon path");
});

it("round trips per-button repeat without touching other actions", () => {
  const config = freshConfig();
  config.tiles[0] = {
    repeat: true,
    custom: 7,
    actions: [
      { type: "keys", keys: ["A"] },
      { type: "future", keys: [], payload: 42 },
    ],
  };
  expect(parseConfig(JSON.stringify(config))).toEqual(config);
  expect(
    editAction(config.tiles[0], { type: "keys", keys: ["B"] }),
  ).toMatchObject({
    repeat: true,
    custom: 7,
    actions: [
      { type: "keys", keys: ["B"] },
      { type: "future", keys: [], payload: 42 },
    ],
  });
  expect(() => parseConfig('{"tiles":[{"repeat":"yes"}]}')).toThrow("Repeat");
});

describe("pages", () => {
  it("pads partial pages and preserves all tile fields", () => {
    const tiles = Array.from({ length: 9 }, (_, i) => ({
      label: `Tile ${i}`,
      extra: i,
    }));
    const c = parseConfig(JSON.stringify({ tiles }));
    expect(c.tiles).toHaveLength(16);
    expect(c.tiles[8]).toEqual(tiles[8]);
    expect(parseConfig(JSON.stringify(c))).toEqual(c);
    expect(
      parseConfig(JSON.stringify({ tiles: Array(64).fill({}) })).tiles,
    ).toHaveLength(64);
    expect(() =>
      parseConfig(JSON.stringify({ tiles: Array(65).fill({}) })),
    ).toThrow("64 tiles");
  });
});

it("tracks icon references on the final page", () => {
  const c = parseConfig(
    JSON.stringify({
      tiles: Array.from({ length: 64 }, (_, i) =>
        i === 63 ? { icon: "/icons/last.png" } : {},
      ),
    }),
  );
  expect(referencedAssets(c).has("/icons/last.png")).toBe(true);
  expect(iconReferenced("/icons/last.png", c)).toBe(true);
});
