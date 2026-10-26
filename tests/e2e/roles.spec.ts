import { expect, test } from "@playwright/test";
import { ids } from "../../db/ids";
import { signIn } from "./helpers";

test.beforeEach(({ }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
});

test("a field worker sees the assigned household and not the other case", async ({ page }) => {
  await signIn(page, "sam.okonkwo@foodbank.test");
  await expect(page.getByRole("link", { name: "Households" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Volunteers" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await page.getByRole("link", { name: "Households" }).click();
  await expect(page.getByRole("link", { name: /Henderson household/ })).toBeVisible();
  await expect(page.getByText("Ellis")).toHaveCount(0);
  await page.goto(`/o/food-bank/cases/${ids.caseMaria}`);
  await expect(page.getByRole("heading", { name: "That record is not in this organization" })).toBeVisible();
  await expect(page.getByText("neighbor")).toHaveCount(0);
});

test("a volunteer coordinator sees the delivery task and not the case note", async ({ page }) => {
  await signIn(page, "pat.nguyen@foodbank.test");
  await expect(page.getByRole("link", { name: "Households" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Cases" })).toHaveCount(0);
  await page.getByRole("link", { name: "Volunteers" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Chris Patel · Driving, Spanish" })).toBeVisible();
  await expect(page.getByText("Thursday pantry delivery")).toBeVisible();
  await expect(page.getByText("Thursday window")).toHaveCount(0);
  await page.goto(`/o/food-bank/cases/${ids.caseMaria}`);
  await expect(page.getByRole("heading", { name: "That record is not in this organization" })).toBeVisible();
});

test("an inventory manager can download stock and a viewer cannot", async ({ page }) => {
  await signIn(page, "lee.ortiz@foodbank.test");
  await page.goto("/o/food-bank/inventory");
  await expect(page.locator("span").filter({ hasText: "Rice 10 lb" })).toBeVisible();
  await expect(page.locator("span").filter({ hasText: "Food box" })).toBeVisible();
  const csv = await page.request.get("/api/reports/food-bank");
  expect(csv.status()).toBe(200);
  const body = await csv.text();
  expect(body).toContain("Rice 10 lb");
  expect(body).toContain("Food box");
  expect(body).not.toContain("neighbor");
  await page.getByRole("button", { name: "Sign out" }).click();
  await signIn(page, "jordan.hale@foodbank.test");
  await page.goto("/o/food-bank/reports");
  await expect(page.getByRole("link", { name: "Download CSV" })).toHaveCount(0);
  const refused = await page.request.get("/api/reports/food-bank");
  expect(refused.status()).toBe(403);
  const otherOrg = await page.request.get("/api/reports/rural-assistance");
  expect(otherOrg.status()).toBe(404);
});

test("a viewer search uses the household code", async ({ page }) => {
  await signIn(page, "jordan.hale@foodbank.test");
  await page.goto("/o/food-bank/search?q=Eastside");
  await expect(page.getByText("H-1042 · Household H-1042")).toBeVisible();
  await expect(page.getByText("Henderson")).toHaveCount(0);
  await expect(page.getByText("217-555-0148")).toHaveCount(0);
});
