import { test, expect, type Page } from '@playwright/test';

const TEST_USER = {
  email: `e2e-${Date.now()}@flowforge.io`,
  password: 'TestPassword123!',
  firstName: 'E2E',
  lastName: 'Test',
};

// ─── Auth flow ────────────────────────────────────────────────────────────────

test.describe('Authentication', () => {
  test('registers a new user and lands on workflows page', async ({ page }) => {
    await page.goto('/auth/register');

    await page.fill('input[type="text"]:first-of-type', TEST_USER.firstName);
    await page.fill('input[type="text"]:last-of-type', TEST_USER.lastName);
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);

    await page.click('button[type="button"]:has-text("Create Account")');

    await page.waitForURL('**/workflows', { timeout: 10_000 });
    expect(page.url()).toContain('/workflows');
  });

  test('logs in with valid credentials', async ({ page }) => {
    await page.goto('/auth/login');

    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button:has-text("Sign In")');

    await page.waitForURL('**/workflows', { timeout: 10_000 });
    expect(page.url()).toContain('/workflows');
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/auth/login');

    await page.fill('input[type="email"]', 'nobody@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button:has-text("Sign In")');

    await expect(page.locator('.el-alert')).toBeVisible({ timeout: 5_000 });
    expect(page.url()).toContain('/auth/login');
  });

  test('redirects unauthenticated users to login', async ({ page }) => {
    // Clear any stored token
    await page.evaluate(() => localStorage.removeItem('ff_token'));
    await page.goto('/workflows');

    await page.waitForURL('**/auth/login', { timeout: 5_000 });
    expect(page.url()).toContain('/auth/login');
  });
});

// ─── Workflows page ───────────────────────────────────────────────────────────

test.describe('Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_USER.email, TEST_USER.password);
  });

  test('shows the workflows list page', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.locator('h1:has-text("Workflows")')).toBeVisible();
  });

  test('creates a new workflow via the dialog', async ({ page }) => {
    await page.goto('/workflows');
    await page.click('button:has-text("New Workflow")');

    await expect(page.locator('.el-dialog')).toBeVisible();
    await page.fill('.el-dialog input', 'My E2E Workflow');
    await page.click('.el-dialog button:has-text("Create")');

    // Should redirect to the editor
    await page.waitForURL('**/edit', { timeout: 10_000 });
    await expect(page.locator('.editor-shell')).toBeVisible({ timeout: 5_000 });
  });

  test('displays workflow cards in the grid', async ({ page }) => {
    await page.goto('/workflows');
    // Wait for grid to populate
    await page.waitForSelector('.workflow-card', { timeout: 10_000 });
    const cards = page.locator('.workflow-card');
    expect(await cards.count()).toBeGreaterThan(0);
  });
});

// ─── Workflow editor ──────────────────────────────────────────────────────────

test.describe('Workflow Editor', () => {
  let workflowId: string;

  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_USER.email, TEST_USER.password);

    // Create a workflow via API and navigate to its editor
    const token = await page.evaluate(() => localStorage.getItem('ff_token'));
    const res = await page.request.post('/rest/workflows', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: 'E2E Test Workflow', nodes: [], connections: {} },
    });
    const body = await res.json() as { id: string };
    workflowId = body.id;
  });

  test('opens the editor with canvas and toolbar', async ({ page }) => {
    await page.goto(`/workflows/${workflowId}/edit`);

    await expect(page.locator('.editor-toolbar')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.node-palette')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.vue-flow')).toBeVisible({ timeout: 5_000 });
  });

  test('shows the workflow name in the toolbar', async ({ page }) => {
    await page.goto(`/workflows/${workflowId}/edit`);
    await expect(page.locator('.workflow-title')).toContainText('E2E Test Workflow', { timeout: 8_000 });
  });

  test('can save the workflow with Ctrl+S', async ({ page }) => {
    await page.goto(`/workflows/${workflowId}/edit`);
    await page.waitForSelector('.editor-toolbar', { timeout: 10_000 });
    await page.keyboard.press('Control+s');

    // Should show success message
    await expect(page.locator('.el-message')).toBeVisible({ timeout: 3_000 });
  });

  test('shows node palette with categorized nodes', async ({ page }) => {
    await page.goto(`/workflows/${workflowId}/edit`);
    await page.waitForSelector('.node-palette', { timeout: 10_000 });

    await expect(page.locator('.group-header')).not.toHaveCount(0);
    await expect(page.locator('.palette-node')).not.toHaveCount(0);
  });
});

// ─── Executions page ──────────────────────────────────────────────────────────

test.describe('Executions', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_USER.email, TEST_USER.password);
  });

  test('shows the executions list page', async ({ page }) => {
    await page.goto('/executions');
    await expect(page.locator('h1:has-text("Executions")')).toBeVisible();
  });
});

// ─── Credentials page ────────────────────────────────────────────────────────

test.describe('Credentials', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_USER.email, TEST_USER.password);
  });

  test('shows the credentials page', async ({ page }) => {
    await page.goto('/credentials');
    await expect(page.locator('h1:has-text("Credentials")')).toBeVisible();
  });

  test('opens the create credential dialog', async ({ page }) => {
    await page.goto('/credentials');
    await page.click('button:has-text("Add Credential")');
    await expect(page.locator('.el-dialog')).toBeVisible();
  });
});

// ─── Settings ────────────────────────────────────────────────────────────────

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_USER.email, TEST_USER.password);
  });

  test('shows the profile settings page', async ({ page }) => {
    await page.goto('/settings/profile');
    await expect(page.locator('h2:has-text("Profile")')).toBeVisible();
  });

  test('shows the API keys page', async ({ page }) => {
    await page.goto('/settings/api-keys');
    await expect(page.locator('h2:has-text("API Keys")')).toBeVisible();
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Sign In")');
  await page.waitForURL('**/workflows', { timeout: 10_000 });
}
