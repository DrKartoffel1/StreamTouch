import { presets } from "./presets";
export const themeLabels = {
  background: "Background",
  button: "Button",
  border: "Border",
  text: "Text",
  icon: "Icon",
  button_press: "Press glow",
  border_pressed: "Pressed border",
  text_pressed: "Pressed text",
  icon_pressed: "Pressed icon",
  animation: "Pressed button",
};
export type ThemeKey = keyof typeof themeLabels;
export type Theme = Record<ThemeKey, string> & {
  background_mode?: "color" | "image";
  background_image?: string;
  background_blur_image?: string;
  button_opacity?: number;
  button_blur?: number;
};
export interface Action {
  type: string;
  keys: string[];
  [key: string]: unknown;
}
export interface Tile {
  repeat?: boolean;
  label?: string;
  icon?: string;
  actions?: Action[];
  [key: string]: unknown;
}
export interface Config {
  tiles: Tile[];
  theme: Theme;
  theme_presets: Record<string, Theme>;
  [key: string]: unknown;
}
export const MAX_PAGES = 8;
export const TILES_PER_PAGE = 8;
export function freshConfig(): Config {
  return structuredClone({
    tiles: Array.from({ length: 8 }, () => ({})),
    theme: presets.Kartoffel,
    theme_presets: presets,
  });
}
function object(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function validateTheme(v: unknown) {
  if (!object(v)) throw Error("Theme must be an object.");
  for (const k of Object.keys(themeLabels))
    if (
      v[k] !== undefined &&
      (typeof v[k] !== "string" || !/^#[0-9a-f]{6}$/i.test(v[k] as string))
    )
      throw Error(`Invalid color: ${k}. Use #RRGGBB.`);
  if (
    v.background_mode !== undefined &&
    !["color", "image"].includes(v.background_mode as string)
  )
    throw Error("Invalid background mode.");
  for (const key of ["background_image", "background_blur_image"])
    if (
      v[key] !== undefined &&
      (typeof v[key] !== "string" ||
        !safePath(v[key] as string) ||
        !/^\/backgrounds\/[^/]+\.jpg$/.test(v[key] as string))
    )
      throw Error("Invalid background image path.");
  for (const [key, max] of [
    ["button_opacity", 255],
    ["button_blur", 24],
  ] as const)
    if (
      v[key] !== undefined &&
      (!Number.isInteger(v[key]) ||
        (v[key] as number) < 0 ||
        (v[key] as number) > max)
    )
      throw Error(`Invalid ${key}.`);
}
export function parseConfig(input: string): Config {
  const v: unknown = JSON.parse(input);
  if (!object(v)) throw Error("Configuration must be a JSON object.");
  if (
    v.tiles !== undefined &&
    (!Array.isArray(v.tiles) || v.tiles.length > MAX_PAGES * TILES_PER_PAGE)
  )
    throw Error("Expected at most 64 tiles (8 pages).");
  const tiles = (v.tiles || []) as unknown[];
  for (const t of tiles) {
    if (!object(t)) throw Error("Each tile must be an object.");
    if (t.repeat !== undefined && typeof t.repeat !== "boolean")
      throw Error("Repeat must be true or false.");
    if (t.label !== undefined && typeof t.label !== "string")
      throw Error("Labels must be text.");
    if (
      t.icon !== undefined &&
      (typeof t.icon !== "string" || (t.icon !== "" && !safePath(t.icon)))
    )
      throw Error("Invalid icon path.");
    if (
      t.actions !== undefined &&
      (!Array.isArray(t.actions) ||
        !t.actions.every(
          (a) =>
            object(a) &&
            typeof a.type === "string" &&
            Array.isArray(a.keys) &&
            a.keys.every((k) => typeof k === "string"),
        ))
    )
      throw Error("Invalid action list.");
  }
  if (v.theme !== undefined) validateTheme(v.theme);
  if (v.theme_presets !== undefined) {
    if (!object(v.theme_presets)) throw Error("Invalid presets.");
    Object.values(v.theme_presets).forEach(validateTheme);
  }
  const defaults = freshConfig();
  return {
    ...v,
    tiles: [
      ...tiles,
      ...Array.from(
        { length: Math.max(8, Math.ceil(tiles.length / 8) * 8) - tiles.length },
        () => ({}),
      ),
    ] as Tile[],
    theme: { ...defaults.theme, ...(v.theme as object) },
    theme_presets: Object.fromEntries(
      Object.entries({
        ...defaults.theme_presets,
        ...(v.theme_presets as object),
      }).map(([n, t]) => [n, { ...defaults.theme, ...t }]),
    ),
  };
}
export function safePath(path: string) {
  return (
    path.length > 0 &&
    [...path].every(
      (c) =>
        c.charCodeAt(0) >= 32 &&
        c.charCodeAt(0) !== 127 &&
        c !== ":" &&
        c !== "\\",
    ) &&
    !path.split("/").includes("..")
  );
}
export function editAction(tile: Tile, action: Action): Tile {
  return {
    ...tile,
    actions: [
      { ...tile.actions?.[0], ...action },
      ...(tile.actions?.slice(1) || []),
    ],
  };
}
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (object(v))
    return (
      "{" +
      Object.keys(v)
        .filter((k) => v[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}
