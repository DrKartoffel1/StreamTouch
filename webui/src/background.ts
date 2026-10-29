import type { Theme, Config } from "./config";
export const SCREEN_WIDTH = 800,
  SCREEN_HEIGHT = 480,
  MAX_BACKGROUND_BYTES = 512 * 1024;
export function coverCrop(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw Error("Invalid image dimensions.");
  const scale = Math.max(SCREEN_WIDTH / width, SCREEN_HEIGHT / height);
  const cropWidth = SCREEN_WIDTH / scale,
    cropHeight = SCREEN_HEIGHT / scale;
  return {
    x: (width - cropWidth) / 2,
    y: (height - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
    scale,
  };
}
export function opacity(theme: Theme) {
  return theme.button_opacity ?? 160;
}
export function blurRadius(theme: Theme) {
  return theme.button_blur ?? 0;
}
export function blurredPath(path: string, radius: number) {
  return path.replace(/\.jpg$/, `-blur-${radius}.jpg`);
}
export function blurMatches(path: string, radius: number, candidate?: string) {
  const exact = blurredPath(path, radius);
  return (
    !!candidate &&
    (candidate === exact ||
      (candidate.startsWith(exact.slice(0, -4) + "-") &&
        candidate.endsWith(".jpg")))
  );
}
export function appearanceReady(theme: Theme) {
  return (
    theme.background_mode !== "image" ||
    (!!theme.background_image &&
      (!blurRadius(theme) ||
        blurMatches(
          theme.background_image,
          blurRadius(theme),
          theme.background_blur_image,
        )))
  );
}
export function hasVisualSettings(theme: Theme) {
  return (
    theme.background_mode === "image" ||
    opacity(theme) !== 160 ||
    blurRadius(theme) !== 0
  );
}
export function referencedAssets(config: Config) {
  const paths = new Set(
    config.tiles.map((t) => t.icon).filter((p): p is string => !!p),
  );
  for (const theme of [config.theme, ...Object.values(config.theme_presets)]) {
    if (theme.background_image) paths.add(theme.background_image);
    if (theme.background_blur_image) paths.add(theme.background_blur_image);
  }
  return paths;
}
export function activeAssets(config: Config) {
  const paths = new Set(
    config.tiles.map((t) => t.icon).filter((p): p is string => !!p),
  );
  if (config.theme.background_mode === "image") {
    if (config.theme.background_image) paths.add(config.theme.background_image);
    if (config.theme.background_blur_image)
      paths.add(config.theme.background_blur_image);
  }
  return paths;
}
function canvas() {
  const c = document.createElement("canvas");
  c.width = SCREEN_WIDTH;
  c.height = SCREEN_HEIGHT;
  return c;
}
async function jpeg(c: HTMLCanvasElement) {
  for (const quality of [0.9, 0.8, 0.65]) {
    const blob = await new Promise<Blob>((resolve, reject) =>
      c.toBlob(
        (b) => (b ? resolve(b) : reject(Error("Image encoding failed."))),
        "image/jpeg",
        quality,
      ),
    );
    if (blob.size <= MAX_BACKGROUND_BYTES) return blob;
  }
  throw Error("Prepared image exceeds 512 KiB. Choose a simpler image.");
}
export async function prepareWallpaper(file: File, color: string) {
  if (file.size > 25 * 1024 * 1024)
    throw Error("Choose an image under 25 MiB.");
  const image = await createImageBitmap(file);
  try {
    if (image.width * image.height > 32_000_000)
      throw Error("Choose an image under 32 megapixels.");
    const c = canvas(),
      ctx = c.getContext("2d")!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, c.width, c.height);
    const crop = coverCrop(image.width, image.height);
    ctx.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      c.width,
      c.height,
    );
    return {
      path: `/backgrounds/bg-${crypto.randomUUID()}.jpg`,
      blob: await jpeg(c),
    };
  } finally {
    image.close();
  }
}
// Three separable box passes approximate Gaussian blur. Clamp edge pixels;
// use the generated JPEG on both browser/device rather than browser-only CSS blur.
export function blurPixels(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
) {
  let src = new Uint8ClampedArray(input),
    dst = new Uint8ClampedArray(input.length);
  if (!radius) return src;
  const r = Math.max(1, Math.round(radius / 2)),
    window = 2 * r + 1;
  for (let pass = 0; pass < 3; pass++)
    for (let axis = 0; axis < 2; axis++) {
      const major = axis ? width : height,
        minor = axis ? height : width;
      for (let a = 0; a < major; a++)
        for (let channel = 0; channel < 3; channel++) {
          let sum = 0;
          const at = (b: number) =>
            axis
              ? (Math.max(0, Math.min(minor - 1, b)) * width + a) * 4 + channel
              : (a * width + Math.max(0, Math.min(minor - 1, b))) * 4 + channel;
          for (let b = -r; b <= r; b++) sum += src[at(b)];
          for (let b = 0; b < minor; b++) {
            dst[at(b)] = Math.round(sum / window);
            sum += src[at(b + r + 1)] - src[at(b - r)];
          }
        }
      for (let i = 3; i < dst.length; i += 4) dst[i] = 255;
      [src, dst] = [dst, src];
    }
  return src;
}
export async function prepareBlur(blob: Blob, radius: number) {
  const image = await createImageBitmap(blob);
  try {
    const c = canvas(),
      ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, c.width, c.height);
    pixels.data.set(blurPixels(pixels.data, c.width, c.height, radius));
    ctx.putImageData(pixels, 0, 0);
    return await jpeg(c);
  } finally {
    image.close();
  }
}
