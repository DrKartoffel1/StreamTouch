import { test, expect, type Page } from "@playwright/test";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAADklEQVR4nGP4DwUMMAYAj4IP8TylVlEAAAAASUVORK5CYII=",
  "base64",
);
async function installDevice(
  page: Page,
  mode: "normal" | "old" | "refuse" | "delayed" = "normal",
  waitForReady = true,
) {
  await page.addInitScript(
    ({ bytes, mode }) => {
      const state = {
        config: { tiles: [{ label: "Play", icon: "/icons/used.png" }] },
        files: {
          "/icons/used.png": bytes,
          "/icons/unused.png": bytes,
        } as Record<string, number[]>,
        commands: [] as string[],
      };
      Object.assign(window, { __libraryDevice: state });
      Object.defineProperty(navigator, "serial", {
        configurable: true,
        value: {
          requestPort: async () => {
            let incoming: ReadableStreamDefaultController<Uint8Array>;
            const encoder = new TextEncoder();
            const reply = (message: string) =>
              incoming.enqueue(encoder.encode(message + "\n"));
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
                  const command = new TextDecoder().decode(bytes).trim();
                  state.commands.push(command);
                  if (command === "GET_JSON")
                    reply("SYNC_JSON:" + JSON.stringify(state.config));
                  else if (command.startsWith("JSON:"))
                    state.config = JSON.parse(command.slice(5));
                  else if (command.startsWith("GET_FILE:")) {
                    const path = command.slice(9),
                      data = state.files[path] || [];
                    const sendFile = () => {
                      reply(`SYNC_FILE:${path}:${data.length}`);
                      if (data.length) incoming.enqueue(Uint8Array.from(data));
                    };
                    if (mode === "delayed")
                      Object.assign(window, { __releaseIcon: sendFile });
                    else sendFile();
                  } else if (command === "LIST_ICONS" && mode !== "old")
                    reply(
                      "SYNC_ICONS:" +
                        JSON.stringify({
                          version: 1,
                          files: Object.keys(state.files).map((path) => ({
                            path,
                            size: state.files[path].length,
                            in_use: state.config.tiles.some(
                              (t) => t.icon === path,
                            ),
                          })),
                        }),
                    );
                  else if (command.startsWith("DELETE_ICON:")) {
                    const path = command.slice(12);
                    if (mode === "refuse")
                      reply(
                        "ICON_DELETED:" +
                          JSON.stringify({
                            path,
                            ok: false,
                            error: "SD card refused deletion",
                          }),
                      );
                    else {
                      delete state.files[path];
                      reply(
                        "ICON_DELETED:" + JSON.stringify({ path, ok: true }),
                      );
                    }
                  }
                },
              }),
            };
          },
        },
      });
    },
    { bytes: Array.from(png), mode },
  );
  await page.goto("./");
  await expect(page.getByLabel("Button label", { exact: true })).toBeEnabled();
  await page
    .getByRole("button", { name: "Connect device", exact: true })
    .click();
  if (waitForReady)
    await expect(page.locator(".connection")).toHaveText("ready", {
      timeout: 10000,
    });
}
async function commands(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __libraryDevice: { commands: string[] } })
        .__libraryDevice.commands,
  );
}
test("primary controls replace the slogan and stay prominent on mobile", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.getByText("A little touch.", { exact: false })).toHaveCount(
    0,
  );
  const actions = page.getByRole("region", {
    name: "Device connection and saving",
  });
  await expect(
    actions.getByRole("button", { name: "Connect device" }),
  ).toBeVisible();
  await expect(
    actions.getByRole("button", { name: "Apply to Device" }),
  ).toBeVisible();
  await expect(actions).toContainText("Connect a device first");
  await page.setViewportSize({ width: 390, height: 844 });
  const connect = await actions
    .getByRole("button", { name: "Connect device" })
    .boundingBox();
  expect(connect!.height).toBeGreaterThanOrEqual(48);
  expect(connect!.y + connect!.height).toBeLessThan(844);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("preview preserves device coordinates, bitmap labels and native icon size at any scale", async ({
  page,
}) => {
  await installDevice(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() =>
        page
          .locator(".device-grid")
          .evaluate((el) =>
            Number(
              getComputedStyle(el)
                .transform.split(",")[0]
                .replace("matrix(", ""),
            ),
          ),
      )
      .toBeGreaterThan(0);
    const geometry = await page.locator(".device-grid").evaluate((el) => {
      const grid = el as HTMLElement;
      const buttons = Array.from(
        grid.querySelectorAll<HTMLElement>(".device-tile"),
      );
      return {
        width: grid.offsetWidth,
        height: grid.offsetHeight,
        first: {
          x: buttons[0].offsetLeft,
          y: buttons[0].offsetTop,
          w: buttons[0].offsetWidth,
          h: buttons[0].offsetHeight,
        },
        columns: buttons.slice(0, 4).map((b) => b.offsetWidth),
        icon: {
          width: (buttons[0].querySelector(".tile-icon") as HTMLElement)
            .offsetWidth,
          height: (buttons[0].querySelector(".tile-icon") as HTMLElement)
            .offsetHeight,
        },
        labelY:
          (buttons[0].querySelector(".tile-label") as HTMLElement).offsetTop +
          buttons[0].clientTop,
        noIconY:
          (buttons[1].querySelector(".tile-label") as HTMLElement).offsetTop +
          buttons[1].clientTop,
        canvasHeight: (buttons[0].querySelector("canvas") as HTMLCanvasElement)
          .height,
      };
    });
    expect(geometry).toMatchObject({
      width: 800,
      height: 480,
      first: { x: 30, y: 30, w: 163, h: 195 },
      columns: [163, 162, 163, 162],
      icon: { width: 119, height: 138 },
      labelY: 155,
      noIconY: 84,
      canvasHeight: 27,
    });
    await expect(page.locator(".tile-icon").first()).toHaveCSS(
      "mask-size",
      "2px 2px",
    );
  }
  await expect(page.locator(".slot-number,.tile-placeholder")).toHaveCount(0);
});
test("icon library protects used icons and requires confirmation for permanent deletion", async ({
  page,
}) => {
  await installDevice(page);
  await page.getByRole("tab", { name: "Icons", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Delete /icons/used.png", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Delete /icons/unused.png", exact: true }),
  ).toBeEnabled();
  expect((await commands(page)).some((c) => c.startsWith("DELETE_ICON:"))).toBe(
    false,
  );
  await page
    .getByRole("button", { name: "Delete /icons/unused.png", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("cannot be undone");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await commands(page)).some((c) => c.startsWith("DELETE_ICON:"))).toBe(
    false,
  );
  await page
    .getByRole("button", { name: "Delete /icons/unused.png", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Delete /icons/unused.png", exact: true }),
  ).toHaveCount(0);
  expect(
    (await commands(page)).filter((c) => c.startsWith("DELETE_ICON:")),
  ).toEqual(["DELETE_ICON:/icons/unused.png"]);
  await expect(
    page.getByRole("button", { name: "Delete /icons/used.png", exact: true }),
  ).toBeDisabled();
});
test("draft references protect unused device files; SD refusal is visible", async ({
  page,
}) => {
  await installDevice(page, "refuse");
  await page.locator('input[accept=".json,application/json"]').setInputFiles({
    name: "draft.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ tiles: [{ icon: "/icons/unused.png" }] }),
    ),
  });
  await page.getByRole("tab", { name: "Icons", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Delete /icons/unused.png", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Delete /icons/unused.png", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Delete /icons/unused.png", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "SD card refused deletion",
  );
  await expect(page.getByRole("status")).toContainText(
    "Icon deletion was not confirmed",
  );
  await expect(
    page.getByRole("button", { name: "Delete /icons/unused.png", exact: true }),
  ).toBeVisible();
});
test("older firmware and disconnected libraries explain what is available", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("tab", { name: "Theme", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Icons", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("tabpanel", { name: "Icons", exact: true }),
  ).toContainText("Connect your StreamTouch");
  await installDevice(page, "old");
  await page.getByRole("tab", { name: "Icons", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("updated firmware", {
    timeout: 7000,
  });
  await page.getByRole("tab", { name: "Button", exact: true }).click();
  await page.getByLabel("Button label", { exact: true }).fill("Still editable");
  await expect(
    page.getByRole("button", { name: "Apply to Device" }),
  ).toBeEnabled();
});

test("sync feedback remains fetching until every icon has arrived", async ({
  page,
}) => {
  await installDevice(page, "delayed", false);
  await expect(
    page.getByRole("button", { name: "Slot 1: Play", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".feedback")).toHaveText(
    "Fetching data from device…",
  );
  await expect(
    page.getByText(
      "Device configuration loaded. Changes stay local until Apply.",
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect(page.locator(".feedback .spinner")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as unknown as { __releaseIcon?: () => void })
            .__releaseIcon,
      ),
    )
    .toBe("function");
  await page.evaluate(() =>
    (window as unknown as { __releaseIcon: () => void }).__releaseIcon(),
  );
  await expect(page.locator(".connection")).toHaveText("ready");
  await expect(page.locator(".feedback")).toHaveText(
    "Device configuration loaded. Changes stay local until Apply.",
  );
  await expect(page.locator(".feedback .spinner")).toHaveCount(0);
});
test("shortcut recorder uses a keyboard symbol and key-specific instructions", async ({
  page,
}) => {
  await page.goto("./");
  const record = page.getByRole("button", {
    name: "Record shortcut",
    exact: true,
  });
  await expect(record.locator("svg.lucide-keyboard")).toBeVisible();
  await expect(record.locator("svg.lucide-mic")).toHaveCount(0);
  await record.click();
  await expect(
    page.getByText("Press your keys. Escape stops recording.", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(record).toBeVisible();
});
