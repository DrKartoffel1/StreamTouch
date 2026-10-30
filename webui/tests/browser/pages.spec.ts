import { test, expect } from "@playwright/test";

test("pages add, navigate, persist, enforce limits and delete safely", async ({
  page,
}) => {
  await page.goto("./");
  const add = page.getByRole("button", { name: "Add page", exact: true });
  const remove = page.getByRole("button", { name: "Delete page", exact: true });
  const label = page.getByLabel("Button label", { exact: true });
  await expect(add).toBeEnabled();
  await expect(remove).toBeDisabled();
  await label.fill("First page");
  await add.click();
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  await expect(page.locator(".device-tile")).toHaveCount(8);
  await label.fill("Second page");
  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(label).toHaveValue("First page");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(label).toHaveValue("Second page");
  await page.waitForTimeout(350);
  await page.reload();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(label).toHaveValue("Second page");
  for (let n = 2; n < 8; n++) await add.click();
  await expect(add).toBeDisabled();
  await expect(page.getByText("Page 8 of 8", { exact: true })).toBeVisible();
  await remove.click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Page 8 of 8", { exact: true })).toBeVisible();
  for (let n = 8; n > 1; n--) {
    await remove.click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await expect(remove).toBeDisabled();
  await expect(label).toHaveValue("First page");
});

test("deleting the first page preserves the following page's buttons", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await page.getByLabel("Button label", { exact: true }).fill("Keep me");
  await page.getByRole("button", { name: "Previous page" }).click();
  await page.getByRole("button", { name: "Delete page" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Slot 1: Keep me" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete page" }),
  ).toBeDisabled();
});
