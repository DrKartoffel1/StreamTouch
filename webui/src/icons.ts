export const MAX_ICON_BYTES = 32 * 1024;
export async function stageIcon(
  file: File,
): Promise<{ path: string; blob: Blob }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > MAX_ICON_BYTES)
    throw Error("Choose a PNG under 32 KiB to fit the device transfer window.");
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b))
    throw Error("Icons must be PNG images.");
  const image = await createImageBitmap(file);
  image.close();
  return {
    path: `/icons/studio-${crypto.randomUUID()}.png`,
    blob: new Blob([bytes], { type: "image/png" }),
  };
}
