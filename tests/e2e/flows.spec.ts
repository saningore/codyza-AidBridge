import { expect, test, type Page } from "@playwright/test";
import { demoPassword, ids } from "../../db/ids";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/o\//);
}

test.describe("desktop workspace", () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
  });

  test("a case worker opens a household, a case, and adds a note", async ({ page }) => {
    await signIn(page, "maria.santos@foodbank.test");
    await expect(page.getByRole("heading", { name: "Hello, Maria" })).toBeVisible();
    await expect(page.getByText("Sample organization")).toBeVisible();
    await page.getByRole("link", { name: "Households" }).click();
    await page.getByRole("link", { name: /H-1042/ }).click();
    await expect(page.getByRole("heading", { name: "Henderson household" })).toBeVisible();
    await expect(page.getByText("Phone 217-555-0148")).toBeVisible();
    await page.goto(`/o/food-bank/cases/${ids.caseMaria}`);
    await expect(page.getByText("neighbor")).toBeVisible();
    const note = `Delivery window confirmed ${Date.now()}`;
    await page.getByLabel("Note").fill(note);
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText(note)).toBeVisible();
  });

  test("another organization cannot open a food-bank household", async ({ page }) => {
    await signIn(page, "alex.morgan@rural.test");
    await expect(page.getByRole("heading", { name: "Hello, Alex" })).toBeVisible();
    await page.goto(`/o/food-bank/households/${ids.henderson}`);
    await expect(page.getByRole("heading", { name: "That record is not in this organization" })).toBeVisible();
    await expect(page.getByText("Henderson")).toHaveCount(0);
    await expect(page.getByText("217-555-0148")).toHaveCount(0);
  });

  test("a viewer sees the household code without the name or phone", async ({ page }) => {
    await signIn(page, "jordan.hale@foodbank.test");
    await page.goto("/o/food-bank/households");
    await expect(page.getByText("Household H-1042")).toBeVisible();
    expect(await page.getByText("Henderson").count()).toBe(0);
    expect(await page.getByText("217-555-0148").count()).toBe(0);
    await page.goto(`/o/food-bank/households/${ids.henderson}`);
    await expect(page.getByRole("heading", { name: "Household H-1042" })).toBeVisible();
    expect(await page.getByText("Henderson").count()).toBe(0);
    expect(await page.getByText("217-555-0148").count()).toBe(0);
    expect(await page.getByText("Leave the box").count()).toBe(0);
    expect(await page.getByText("dana.henderson@example.net").count()).toBe(0);
  });
});

test("the household list stays usable on a phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "maria.santos@foodbank.test");
  await page.getByRole("link", { name: "Households" }).click();
  const add = page.getByRole("link", { name: "Add household" });
  await expect(add).toBeVisible();
  const box = await add.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole("link", { name: /Henderson household/ })).toBeVisible();
});
