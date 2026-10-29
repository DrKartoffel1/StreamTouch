import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { saveDraft, loadDraft } from "../src/draft";
import { freshConfig } from "../src/config";
it("restores the full draft, baseline and staged icon bytes", async () => {
  const config = freshConfig();
  config.tiles[1] = { label: "Draft", icon: "/icons/test.png" };
  const d = {
    config,
    baseline: freshConfig(),
    icons: { "/icons/test.png": new Blob(["png"]) },
  };
  await saveDraft(d);
  const restored = await loadDraft();
  expect(restored?.config).toEqual(config);
  expect(restored?.baseline).toEqual(d.baseline);
  expect(await restored?.icons["/icons/test.png"].text()).toBe("png");
});
it("retains wallpaper bytes referenced by a saved preset, including color mode", async () => {
  const config = freshConfig();
  config.theme_presets.Custom = {
    ...config.theme,
    background_mode: "image",
    background_image: "/backgrounds/preset.jpg",
  };
  await saveDraft({
    config,
    baseline: freshConfig(),
    icons: {
      "/backgrounds/preset.jpg": new Blob(["jpeg"]),
      "/backgrounds/orphan.jpg": new Blob(["unused"]),
    },
  });
  const restored = await loadDraft();
  expect(await restored?.icons["/backgrounds/preset.jpg"].text()).toBe("jpeg");
  expect(restored?.icons["/backgrounds/orphan.jpg"]).toBeUndefined();
});

it("keeps draft writes ordered when earlier image preparation is slow", async () => {
  const first = freshConfig();
  first.tiles[0] = { label: "Older", icon: "/icons/slow.png" };
  const latest = structuredClone(first);
  latest.tiles[0].label = "Newest";
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const image = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
  const original = image.arrayBuffer.bind(image);
  image.arrayBuffer = async () => {
    await held;
    return original();
  };
  const older = saveDraft({
    config: first,
    baseline: freshConfig(),
    icons: { "/icons/slow.png": image },
  });
  const newer = saveDraft({
    config: latest,
    baseline: freshConfig(),
    icons: {},
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  release();
  await Promise.all([older, newer]);
  expect((await loadDraft())!.config.tiles[0].label).toBe("Newest");
});

it("continues saving after one image read fails", async () => {
  const config = freshConfig();
  config.tiles[0] = { icon: "/icons/broken.png" };
  const image = new Blob();
  image.arrayBuffer = async () => {
    throw Error("read failed");
  };
  await expect(
    saveDraft({
      config,
      baseline: freshConfig(),
      icons: { "/icons/broken.png": image },
    }),
  ).rejects.toThrow("read failed");
  config.tiles[0] = { label: "Recovered" };
  await saveDraft({ config, baseline: freshConfig(), icons: {} });
  expect((await loadDraft())!.config.tiles[0].label).toBe("Recovered");
});
