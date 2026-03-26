import { expect, test } from "@playwright/test";

test("backend health endpoints should be healthy", async ({ request }) => {
	const workerHealth = await request.get("http://127.0.0.1:8787/health");
	expect(workerHealth.ok()).toBeTruthy();
	expect(await workerHealth.json()).toEqual({ ok: true });

	const attemptWorkerHealth = await request.get("http://127.0.0.1:8788/health");
	expect(attemptWorkerHealth.ok()).toBeTruthy();
	expect(await attemptWorkerHealth.json()).toEqual({ ok: true });
});

test("frontend login screen should render", async ({ page }) => {
	await page.goto("/");
	await expect(
		page.getByRole("heading", {
			name: "api-workers",
		}),
	).toBeVisible();
	await expect(page.getByLabel("管理员密码")).toBeVisible();
	await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
});
