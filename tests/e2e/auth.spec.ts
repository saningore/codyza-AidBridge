import { expect, test } from "@playwright/test";
import { demoMfa, demoPassword } from "../../db/ids";
import { currentTotp } from "../../lib/totp";

test.beforeEach(({ }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
});

test("a wrong password stays on the sign-in page", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("maria.santos@foodbank.test");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /incorrect/i })).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("an owner completes the authenticator step and opens settings", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("june.alvarez@foodbank.test");
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByLabel("Authentication code")).toBeVisible();
  await page.getByLabel("Authentication code").fill(currentTotp(demoMfa.june));
  await page.getByRole("button", { name: "Confirm code" }).click();
  await expect(page).toHaveURL(/\/o\/food-bank/);
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Maria Santos · maria.santos@foodbank.test")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save settings" })).toBeVisible();
});

test("health checks answer and a cron call without a secret does not", async ({ request }) => {
  const live = await request.get("/api/health/live");
  const ready = await request.get("/api/health/ready");
  const cron = await request.post("/api/cron");
  expect(live.ok()).toBe(true);
  expect(ready.ok()).toBe(true);
  expect(cron.status()).toBe(404);
});
