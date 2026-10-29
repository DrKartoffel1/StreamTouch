import { test, expect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
async function sourceImage(page: Page) {
  const base64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 4000;
    c.height = 1000;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#0033ee";
    ctx.fillRect(0, 0, 4000, 1000);
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 600, 1000);
    ctx.fillRect(3400, 0, 600, 1000);
    ctx.fillStyle = "#ffff00";
    ctx.fillRect(1800, 300, 400, 400);
    return c.toDataURL("image/png").split(",")[1];
  });
  return {
    name: "wide.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64, "base64"),
  };
}
async function range(page: Page, name: string, value: string) {
  await page.getByLabel(name, { exact: true }).evaluate((el, value) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}
async function wallpaper(page: Page) {
  await page.getByRole("tab", { name: "Theme", exact: true }).click();
  await page
    .getByLabel("Background mode", { exact: true })
    .selectOption("image");
  await page
    .getByLabel("Choose background image", { exact: true })
    .setInputFiles(await sourceImage(page));
  await expect(page.locator(".wallpaper")).toHaveCSS(
    "background-image",
    /blob:/,
  );
}
test("prepares a wide image as a cropped 800x480 wallpaper without stretching", async ({
  page,
}, testInfo) => {
  await page.goto("./");
  await wallpaper(page);
  const image = await page.locator(".wallpaper").evaluate(async (el) => {
    const url = getComputedStyle(el).backgroundImage.slice(5, -2);
    const blob = await (await fetch(url)).blob();
    const bitmap = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 480;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    return {
      w: bitmap.width,
      h: bitmap.height,
      left: Array.from(ctx.getImageData(0, 200, 1, 1).data),
      center: Array.from(ctx.getImageData(400, 240, 1, 1).data),
      bytes: blob.size,
      encoded: Array.from(new Uint8Array(await blob.arrayBuffer())),
    };
  });
  await writeFile(
    `/tmp/streamtouch-wallpaper-${testInfo.project.name}.jpg`,
    Buffer.from(image.encoded),
  );
  expect(image.w).toBe(800);
  expect(image.h).toBe(480);
  expect(image.left[2]).toBeGreaterThan(200);
  expect(image.left[0]).toBeLessThan(30);
  expect(image.center[0]).toBeGreaterThan(200);
  expect(image.bytes).toBeLessThan(512 * 1024);
});
test("caches button-only blur and preserves sharp opaque foregrounds, drafts and presets", async ({
  page,
}, testInfo) => {
  await page.goto("./");
  await wallpaper(page);
  await range(page, "Button transparency", "70");
  await range(page, "Button blur", "8");
  await expect(page.locator(".tile-backdrop")).toHaveCount(8, {
    timeout: 15000,
  });
  await expect(page.locator(".tile-backdrop").first()).toHaveCSS(
    "background-image",
    /blob:/,
  );
  const blurred = await page
    .locator(".tile-backdrop")
    .first()
    .evaluate(async (el) =>
      Array.from(
        new Uint8Array(
          await (
            await fetch(getComputedStyle(el).backgroundImage.slice(5, -2))
          ).arrayBuffer(),
        ),
      ),
    );
  await writeFile(
    `/tmp/streamtouch-blur-${testInfo.project.name}.jpg`,
    Buffer.from(blurred),
  );
  await expect(page.locator(".tile-label").first()).toHaveCSS("opacity", "1");
  await expect(page.locator(".tile-label").first()).toHaveCSS("filter", "none");
  await expect(page.locator(".device-tile").first()).toHaveCSS("opacity", "1");
  await page
    .getByLabel("Button blur", { exact: true })
    .scrollIntoViewIfNeeded();
  await expect(page.locator(".device-viewport")).toBeInViewport();
  await page.screenshot({
    path: `test-results/wallpaper-glass-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByPlaceholder("Preset name").fill("Wallpaper glass");
  await page.getByRole("button", { name: "Save preset", exact: true }).click();
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.locator(".wallpaper")).toHaveCSS(
    "background-image",
    /blob:/,
  );
  await expect(page.locator(".tile-backdrop")).toHaveCount(8);
  await page.getByRole("tab", { name: "Theme", exact: true }).click();
  await expect(page.getByLabel("Button blur", { exact: true })).toHaveValue(
    "8",
  );
  await expect(
    page.getByLabel("Button transparency", { exact: true }),
  ).toHaveValue("70");
  await page
    .getByLabel("Background mode", { exact: true })
    .selectOption("color");
  await expect(page.locator(".wallpaper,.tile-backdrop")).toHaveCount(0);
  await page
    .getByLabel("Theme preset", { exact: true })
    .selectOption("Wallpaper glass");
  await page.getByRole("button", { name: "Load preset", exact: true }).click();
  await expect(page.locator(".wallpaper")).toHaveCSS(
    "background-image",
    /blob:/,
  );
  await expect(page.locator(".tile-backdrop")).toHaveCount(8);
});
async function device(page: Page, supported = true) {
  await page.addInitScript(
    ({ supported }) => {
      const state = {
        config: { tiles: [] } as Record<string, unknown>,
        files: {} as Record<string, number[]>,
        commands: [] as string[],
        receiving: "",
        size: 0,
      };
      Object.assign(window, { __backgroundDevice: state });
      Object.defineProperty(navigator, "serial", {
        configurable: true,
        value: {
          requestPort: async () => {
            let incoming: ReadableStreamDefaultController<Uint8Array>;
            const enc = new TextEncoder();
            const reply = (line: string) =>
              incoming.enqueue(enc.encode(line + "\n"));
            return {
              open: async () => {},
              setSignals: async () => {},
              close: async () => {},
              readable: new ReadableStream({
                start(c) {
                  incoming = c;
                },
              }),
              writable: new WritableStream<Uint8Array>({
                write(bytes) {
                  if (state.receiving) {
                    const path = state.receiving;
                    state.files[path] = Array.from(bytes);
                    state.receiving = "";
                    reply(
                      "SYNC_UPLOAD:" +
                        JSON.stringify({
                          path,
                          state: "done",
                          bytes: bytes.length,
                        }),
                    );
                    return;
                  }
                  const cmd = new TextDecoder().decode(bytes).trim();
                  state.commands.push(cmd);
                  if (cmd === "GET_JSON")
                    reply("SYNC_JSON:" + JSON.stringify(state.config));
                  else if (cmd === "GET_CAPABILITIES" && supported)
                    reply(
                      'SYNC_CAPS:{"cached_backgrounds":true,"upload_v2":true}',
                    );
                  else if (cmd === "GET_RENDER_STATUS")
                    reply('SYNC_RENDER:{"ok":true}');
                  else if (cmd.startsWith("JSON:"))
                    state.config = JSON.parse(cmd.slice(5));
                  else if (cmd.startsWith("FILE_BEGIN:")) {
                    const parts = cmd.split(":");
                    state.receiving = parts[1];
                    state.size = Number(parts[2]);
                    reply(
                      "SYNC_UPLOAD:" +
                        JSON.stringify({ path: parts[1], state: "ready" }),
                    );
                  } else if (cmd.startsWith("GET_FILE:")) {
                    const path = cmd.slice(9),
                      bytes = state.files[path] || [];
                    reply(`SYNC_FILE:${path}:${bytes.length}`);
                    if (bytes.length) incoming.enqueue(Uint8Array.from(bytes));
                  }
                },
              }),
            };
          },
        },
      });
    },
    { supported },
  );
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "Connect device", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Connect device", exact: true })
    .click();
  await expect(page.locator(".connection")).toHaveText("ready", {
    timeout: 10000,
  });
}
test("Apply transfers prepared images and checks rendering before claiming success", async ({
  page,
}) => {
  await device(page);
  await wallpaper(page);
  await range(page, "Button blur", "6");
  await expect(page.locator(".tile-backdrop")).toHaveCount(8, {
    timeout: 15000,
  });
  await expect(
    page.getByRole("button", { name: "Apply to Device", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Apply to Device", exact: true })
    .click();
  await expect(page.locator(".feedback")).toContainText(
    "Saved to device and verified",
  );
  const commands = await page.evaluate(
    () =>
      (window as unknown as { __backgroundDevice: { commands: string[] } })
        .__backgroundDevice.commands,
  );
  expect(commands).toContain("GET_CAPABILITIES");
  expect(commands.filter((c) => c.startsWith("FILE_BEGIN:"))).toHaveLength(2);
  expect(commands).toContain("GET_RENDER_STATUS");
  expect(commands.findIndex((c) => c.startsWith("JSON:"))).toBeGreaterThan(
    Math.max(...commands.map((c, i) => (c.startsWith("FILE_BEGIN:") ? i : -1))),
  );
});
test("old firmware refuses visual Apply before writing any configuration", async ({
  page,
}) => {
  await device(page, false);
  await page.getByRole("tab", { name: "Theme", exact: true }).click();
  await range(page, "Button transparency", "80");
  await page
    .getByRole("button", { name: "Apply to Device", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Update the device firmware",
    { timeout: 7000 },
  );
  const commands = await page.evaluate(
    () =>
      (window as unknown as { __backgroundDevice: { commands: string[] } })
        .__backgroundDevice.commands,
  );
  expect(commands.some((c) => c.startsWith("JSON:"))).toBe(false);
  await expect(
    page.getByText("Unapplied changes", { exact: true }),
  ).toBeVisible();
});
