import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(
    page.getByText(
      "Your workspace, your shortcuts. Start editing or connect a device.",
    ),
  ).toBeVisible();
});
test("edits, restores drafts and protects discard", async ({ page }) => {
  await page.getByLabel("Button label", { exact: true }).fill("My shortcut");
  await page.getByRole("button", { name: "Add key", exact: true }).click();
  await page.getByLabel("Key 1", { exact: true }).fill("LEFT_CTRL");
  await expect(
    page.getByRole("button", { name: "Slot 1: My shortcut" }),
  ).toBeVisible();
  await expect(
    page.getByText("Unapplied changes", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(350);
  await page.reload();
  await expect(page.getByLabel("Button label", { exact: true })).toHaveValue(
    "My shortcut",
  );
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Button label", { exact: true })).toHaveValue(
    "My shortcut",
  );
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Button label", { exact: true })).toHaveValue(
    "",
  );
});
test("theme changes affect the workspace and exact preview colors", async ({
  page,
}) => {
  await page.getByRole("tab", { name: "Theme", exact: true }).click();
  await page
    .getByLabel("Theme preset", { exact: true })
    .selectOption("Dracula");
  await page.getByRole("button", { name: "Load preset", exact: true }).click();
  await expect(page.getByLabel("Background hex")).toHaveValue("#282a36");
  await expect(page.locator(".workspace")).toHaveCSS(
    "background-color",
    "rgb(40, 42, 54)",
  );
  const buttonColor = () =>
    page
      .locator(".device-tile")
      .first()
      .evaluate((el) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = getComputedStyle(el).backgroundColor;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data);
      });
  expect(
    (await buttonColor()).every(
      (channel, i) => Math.abs(channel - [68, 71, 90, 160][i]) <= 1,
    ),
  ).toBe(true);
  const normalBounds = await page.locator(".device-tile").first().boundingBox();
  await page.getByLabel("Pressed state", { exact: true }).check();
  await expect(page.locator(".device-tile").first()).toHaveCSS(
    "transform",
    "none",
  );
  const pressedBounds = await page
    .locator(".device-tile")
    .first()
    .boundingBox();
  expect(pressedBounds!.width).toBeCloseTo(normalBounds!.width, 5);
  expect(pressedBounds!.height).toBeCloseTo(normalBounds!.height, 5);
  expect(
    (await buttonColor()).every(
      (channel, i) => Math.abs(channel - [255, 121, 198, 160][i]) <= 1,
    ),
  ).toBe(true);
  await page.getByPlaceholder("Preset name").fill("My palette");
  await page.getByRole("button", { name: "Save preset", exact: true }).click();
  await expect(page.getByLabel("Theme preset", { exact: true })).toHaveValue(
    "My palette",
  );
});
test("keyboard recording and tab navigation", async ({ page }) => {
  await page
    .getByRole("button", { name: "Record shortcut", exact: true })
    .click();
  await page.keyboard.press("ControlLeft");
  await page.keyboard.press("KeyK");
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Key 1", { exact: true })).toHaveValue(
    "LEFT_CTRL",
  );
  await expect(page.getByLabel("Key 2", { exact: true })).toHaveValue("K");
  await page.getByRole("tab", { name: "Button", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Theme", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("tab", { name: "Theme", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});
test("imports and exports JSON, rejects malformed files", async ({ page }) => {
  await page.locator('input[accept=".json,application/json"]').setInputFiles({
    name: "macros.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        tiles: [
          {
            label: "Imported",
            custom: "preserve",
            actions: [
              { type: "media", keys: ["MEDIA_STOP"] },
              { type: "keys", keys: ["A"] },
            ],
          },
        ],
        unknown: { keep: true },
      }),
    ),
  });
  await expect(page.getByLabel("Button label", { exact: true })).toHaveValue(
    "Imported",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("macros.json");
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream!) chunks.push(c);
  const result = JSON.parse(Buffer.concat(chunks).toString());
  expect(result.unknown).toEqual({ keep: true });
  expect(result.tiles[0].actions).toHaveLength(2);
  await page.locator('input[accept=".json,application/json"]').setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("[]"),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Configuration must be a JSON object",
  );
});
test("narrow layout and base-path reload", async ({ page }, testInfo) => {
  await page.screenshot({
    path: `test-results/studio-${testInfo.project.name}-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Slot 8" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Button settings" }),
  ).toBeVisible();
  if (!(await page.evaluate(() => "serial" in navigator))) {
    await expect(
      page.getByText("This browser supports editing and JSON import/export.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Connect device" }),
    ).toBeDisabled();
  }
  await page.screenshot({
    path: `test-results/studio-${testInfo.project.name}-mobile.png`,
    fullPage: true,
  });
});

test("staged icons survive reload and removing them does not touch hardware", async ({
  page,
}) => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAADklEQVR4nGP4DwUMMAYAj4IP8TylVlEAAAAASUVORK5CYII=",
    "base64",
  );
  await page
    .getByLabel("Choose icon PNG")
    .setInputFiles({ name: "icon.png", mimeType: "image/png", buffer: png });
  await expect(page.locator(".icon-path")).toContainText("/icons/studio-");
  await expect(page.locator(".tile-icon").first()).toBeVisible();
  await page.waitForTimeout(350);
  await page.reload();
  await expect(page.locator(".tile-icon").first()).toBeVisible();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.locator(".icon-path")).toHaveCount(0);
  await page.getByLabel("Choose icon PNG").setInputFiles({
    name: "bad.png",
    mimeType: "image/png",
    buffer: Buffer.from("not png"),
  });
  await expect(page.getByRole("alert")).toContainText("Icons must be PNG");
});

test("connecting preserves a draft and only Apply writes to the device", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = {
      config: { tiles: [{ label: "Device original" }] },
      writes: [] as string[],
      closed: 0,
    };
    Object.assign(window, { __device: state });
    Object.defineProperty(navigator, "serial", {
      configurable: true,
      value: {
        requestPort: async () => {
          let incoming: ReadableStreamDefaultController<Uint8Array>;
          const encoder = new TextEncoder();
          return {
            open: async () => {},
            setSignals: async () => {},
            close: async () => {
              state.closed++;
            },
            readable: new ReadableStream({
              start(c) {
                incoming = c;
              },
            }),
            writable: new WritableStream<Uint8Array>({
              write(bytes) {
                const text = new TextDecoder().decode(bytes);
                state.writes.push(text);
                if (text.startsWith("JSON:"))
                  state.config = JSON.parse(text.slice(5));
                if (text === "GET_JSON\n")
                  incoming.enqueue(
                    encoder.encode(
                      "SYNC_JSON:" + JSON.stringify(state.config) + "\n",
                    ),
                  );
              },
            }),
          };
        },
      },
    });
  });
  await page.goto("./");
  await page.getByLabel("Button label", { exact: true }).fill("Local draft");
  await page.getByRole("button", { name: "Connect device" }).click();
  await expect(page.getByRole("dialog")).toContainText("keeping your draft");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".connection")).toHaveText("ready", {
    timeout: 10000,
  });
  await expect(page.getByLabel("Button label", { exact: true })).toHaveValue(
    "Local draft",
  );
  const state = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __device: {
              writes: string[];
              config: { tiles: { label: string }[] };
              closed: number;
            };
          }
        ).__device,
    );
  expect(
    (await state()).writes.some(
      (s) => s.startsWith("JSON:") || s.startsWith("FILE:"),
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Apply to Device" }).click();
  await expect(
    page.getByText("Saved to device and verified. All changes are up to date."),
  ).toBeVisible();
  expect((await state()).config.tiles[0].label).toBe("Local draft");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.locator(".connection")).toHaveText("disconnected");
  expect((await state()).closed).toBe(1);
});

test("repeat is optional per slot and survives draft reload", async ({
  page,
}) => {
  const repeat = page.getByRole("checkbox", { name: "Repeat while held" });
  await expect(repeat).not.toBeChecked();
  await repeat.check();
  await page.waitForTimeout(350);
  await page.reload();
  await expect(repeat).toBeChecked();
  await page.getByRole("button", { name: "Slot 2", exact: true }).click();
  await expect(repeat).not.toBeChecked();
  await page.getByRole("button", { name: "Slot 1", exact: true }).click();
  await expect(repeat).toBeChecked();
});
