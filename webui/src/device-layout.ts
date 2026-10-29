import font from "./assets/device-font.json";
// ui.cpp plus LVGL default theme at LV_DPI_DEF=130. All units are device pixels.
export const deviceLayout = {
  width: 800,
  height: 480,
  margin: 30,
  gap: 30,
  columns: [163, 162, 163, 162],
  buttonHeight: 195,
  paddingX: 20,
  paddingY: 11,
  border: 2,
  radius: 24,
  contentGap: 4,
  opacity: 160 / 255,
};
const glyphIds = new Map(font.codepoints.map((point, i) => [point, i + 1]));
export function glyphId(char: string) {
  return glyphIds.get(char.codePointAt(0)!) || 0;
}
export function advance(char: string, next = ""): number {
  if (char === "\t") return advance(" ") * 2;
  const id = glyphId(char),
    nextId = glyphId(next);
  if (!id) return 12;
  const left = font.kernLeft[id],
    right = font.kernRight[nextId];
  const kern =
    left && right
      ? font.kernValues[(left - 1) * font.kernRightCount + right - 1]
      : 0;
  return Math.max(0, font.glyphs[id][1] + kern + 8) >> 4;
}
export function textWidth(text: string) {
  const chars = Array.from(text);
  return chars.reduce((sum, c, i) => sum + advance(c, chars[i + 1]), 0);
}
export function labelLayout(text: string) {
  // ui.cpp never sets a label width. LV_SIZE_CONTENT keeps natural width;
  // long labels are clipped by the button, not wrapped to its content box.
  const lines = text.split(/\r\n|\r|\n/);
  return {
    lines,
    width: Math.max(0, ...lines.map(textWidth)),
    height: Math.max(1, lines.length) * font.lineHeight,
  };
}
export function containIcon(
  width: number,
  height: number,
  boxWidth: number,
  boxHeight: number,
) {
  const scale =
    Math.min(
      256,
      Math.floor((boxWidth * 256) / width),
      Math.floor((boxHeight * 256) / height),
    ) / 256;
  return { width: width * scale, height: height * scale };
}
let bitmap: Uint8Array | undefined;
export function drawLabel(
  canvas: HTMLCanvasElement,
  text: string,
  color: string,
) {
  const layout = labelLayout(text);
  canvas.width = Math.max(1, layout.width);
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  bitmap ??= Uint8Array.from(atob(font.bitmap), (c) => c.charCodeAt(0));
  const rgb = color
    .slice(1)
    .match(/../g)!
    .map((c) => parseInt(c, 16));
  layout.lines.forEach((line, row) => {
    let x = 0;
    const chars = Array.from(line);
    chars.forEach((c, i) => {
      const id = glyphId(c);
      if (!id) {
        ctx.strokeStyle = color;
        ctx.strokeRect(x + 1, row * font.lineHeight + 3, 10, 20);
      } else {
        const [index, , w, h, dx, dy] = font.glyphs[id];
        if (w && h) {
          const pixels = ctx.createImageData(w, h);
          for (let p = 0; p < w * h; p++) {
            const nibble = (bitmap![index + (p >> 1)] >> (p % 2 ? 0 : 4)) & 15;
            pixels.data.set([rgb[0], rgb[1], rgb[2], nibble * 17], p * 4);
          }
          const temp = document.createElement("canvas");
          temp.width = w;
          temp.height = h;
          temp.getContext("2d")!.putImageData(pixels, 0, 0);
          ctx.drawImage(
            temp,
            x + dx,
            row * font.lineHeight + font.lineHeight - font.baseline - h - dy,
          );
        }
      }
      x += advance(c, chars[i + 1]);
    });
  });
}
