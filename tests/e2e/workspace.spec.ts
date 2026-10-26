import { expect, test } from "@playwright/test";
import { ids } from "../../db/ids";
import { signIn } from "./helpers";

test.describe("desktop workspace tools", () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
  });

test("a case worker can search, open a program, and use the directory and map", async ({ page }) => {
  await signIn(page, "maria.santos@foodbank.test");
  await page.goto("/o/food-bank/search?q=a");
  await expect(page.getByText("Enter at least two characters.")).toBeVisible();
  await page.goto("/o/food-bank/search?q=Henderson");
  await expect(page.getByRole("link", { name: /Henderson household/ })).toBeVisible();
  await page.goto(`/o/food-bank/programs/${ids.schoolProgram}`);
  await expect(page.getByRole("heading", { name: "School Supply Program" })).toBeVisible();
  await expect(page.getByText("Children receiving supplies")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark inactive" })).toHaveCount(0);
  await page.goto("/o/food-bank/directory");
  await expect(page.getByRole("heading", { name: "Harbor Clinic" })).toBeVisible();
  await expect(page.getByText("217-555-0170")).toBeVisible();
  await page.goto("/o/food-bank/map");
  await expect(page.getByRole("link", { name: "Henderson household" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Harbor Clinic" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Map of households and service sites" })).toBeVisible();
});

test("a case worker moves a case to waiting and back to active", async ({ page }) => {
  await signIn(page, "maria.santos@foodbank.test");
  await page.goto(`/o/food-bank/cases/${ids.caseMaria}`);
  await page.getByRole("button", { name: "Move to Waiting" }).click();
  await expect(page.locator(".badge", { hasText: /^Waiting$/ })).toBeVisible();
  await page.getByRole("button", { name: "Move to Active" }).click();
  await expect(page.locator(".badge", { hasText: /^Active$/ })).toBeVisible();
});

test("a case worker opens the stored consent file and an alert", async ({ page }) => {
  await signIn(page, "maria.santos@foodbank.test");
  await page.goto(`/o/food-bank/cases/${ids.caseMaria}`);
  const href = await page.getByRole("link", { name: "consent-note.pdf" }).getAttribute("href");
  expect(href).toBeTruthy();
  const file = await page.request.get(href!);
  expect(file.ok()).toBe(true);
  expect((await file.body()).subarray(0, 4).toString()).toBe("%PDF");
  const missing = await page.request.get(`/api/files/${ids.note}`);
  expect(missing.status()).toBe(404);
  await page.goto("/o/food-bank/notifications");
  await expect(page.getByText("Case assigned")).toBeVisible();
  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(page.getByText("· new")).toHaveCount(0);
});
});

test("the phone layout can reach search and the case list", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "maria.santos@foodbank.test");
  const households = page.getByRole("link", { name: "Households" });
  await expect(households).toBeVisible();
  const box = await households.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await page.goto("/o/food-bank/cases?status=active");
  await expect(page.getByRole("link", { name: /AC-2041/ })).toBeVisible();
  await page.goto("/o/food-bank/cases?status=closed");
  await expect(page.getByRole("link", { name: /AC-2041/ })).toHaveCount(0);
});
