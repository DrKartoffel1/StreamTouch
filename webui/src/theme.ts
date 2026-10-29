import { themeLabels, type Theme, type ThemeKey } from "./config";
import { opacity } from "./background";
export function luminance(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((x) => parseInt(x, 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function readableAccent(icon: string, background: string) {
  const channels = icon
    .slice(1)
    .match(/../g)!
    .map((c) => parseInt(c, 16));
  const target = luminance(background) > 0.179 ? 0 : 255;
  for (let step = 0; step <= 20; step++) {
    const mix = step / 20;
    const color =
      "#" +
      channels
        .map((c) =>
          Math.round(c + (target - c) * mix)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("");
    if (contrast(color, background) >= 3) return color;
  }
  return target ? "#ffffff" : "#000000";
}
export function themeStyle(theme: Theme): Record<string, string> {
  const light = luminance(theme.background) > 0.179;
  const accent = readableAccent(theme.icon, theme.background);
  return {
    ...Object.fromEntries(
      (Object.keys(themeLabels) as ThemeKey[]).map((k) => [
        `--device-${k}`,
        theme[k],
      ]),
    ),
    "--button-alpha": String(opacity(theme) / 255),
    "--workspace-text": light ? "#000000" : "#ffffff",
    "--muted": light ? "#172222" : "#dde7e7",
    "--surface": light ? "rgba(255,255,255,.88)" : "rgba(18,25,29,.92)",
    "--accent": accent,
    "--accent-text": luminance(accent) > 0.179 ? "#000000" : "#ffffff",
  };
}
