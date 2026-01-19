import { test, expect, Page } from '@playwright/test';

test.describe('Dashboard UI - CRR-1110', () => {
  test.describe('Dashboard Loading', () => {
    test('dashboard loads without errors', async ({ page }) => {
      const response = await page.goto('/');
      expect(response?.status()).toBe(200);
      
      await expect(page.locator('h1:has-text("Cursor RAG")')).toBeVisible();
      await expect(page.locator('#app')).toBeVisible();
    });

    test('sidebar navigation is visible', async ({ page }) => {
      await page.goto('/');
      
      await expect(page.locator('aside')).toBeVisible();
      await expect(page.locator('#nav-overview')).toBeVisible();
      await expect(page.locator('#nav-search')).toBeVisible();
      await expect(page.locator('#nav-gateway')).toBeVisible();
      await expect(page.locator('#nav-skills')).toBeVisible();
      await expect(page.locator('#nav-tools')).toBeVisible();
      await expect(page.locator('#nav-activity')).toBeVisible();
      await expect(page.locator('#nav-settings')).toBeVisible();
    });

    test('page title is correct', async ({ page }) => {
      await page.goto('/');
      await expect(page).toHaveTitle('Cursor RAG Dashboard');
    });
  });

  test.describe('Search Form', () => {
    test('search form is visible on search tab', async ({ page }) => {
      await page.goto('/');
      await page.click('#nav-search');
      
      await page.waitForSelector('#tab-search:not(.hidden)', { timeout: 5000 });
      await expect(page.locator('#search-input')).toBeVisible();
      await expect(page.locator('#tab-search button:has-text("Search")')).toBeVisible();
    });

    test('search form submits and displays results', async ({ page }) => {
      await page.goto('/');
      await page.click('#nav-search');
      await page.waitForSelector('#tab-search:not(.hidden)', { timeout: 5000 });
      
      await page.fill('#search-input', 'test query');
      await page.click('#tab-search button:has-text("Search")');
      
      await expect(page.locator('#search-results')).toBeVisible();
    });

    test('search input accepts keyboard submit', async ({ page }) => {
      await page.goto('/');
      await page.click('#nav-search');
      await page.waitForSelector('#tab-search:not(.hidden)', { timeout: 5000 });
      
      await page.fill('#search-input', 'keyboard test');
      await page.press('#search-input', 'Enter');
      
      await expect(page.locator('#search-results')).toBeVisible();
    });
  });

  test.describe('Activity Log', () => {
    test('activity tab displays log', async ({ page }) => {
      await page.goto('/');
      await page.click('#nav-activity');
      
      await expect(page.locator('#tab-activity')).toBeVisible();
      await expect(page.locator('h2:has-text("Activity Log")')).toBeVisible();
      await expect(page.locator('#activity-log')).toBeVisible();
    });

    test('recent activity preview on overview', async ({ page }) => {
      await page.goto('/');
      
      await expect(page.locator('#recent-activity')).toBeVisible();
      await expect(page.locator('text=Recent Activity')).toBeVisible();
    });
  });

  test.describe('Statistics Cards', () => {
    test('statistics cards show on overview', async ({ page }) => {
      await page.goto('/');
      
      await expect(page.locator('#stat-chunks')).toBeVisible();
      await expect(page.locator('#stat-gateway-tools')).toBeVisible();
      await expect(page.locator('#stat-skills')).toBeVisible();
      await expect(page.locator('#stat-backends')).toBeVisible();
    });

    test('statistics cards display data', async ({ page }) => {
      await page.goto('/');
      
      await page.waitForTimeout(1000);
      
      const chunksText = await page.locator('#stat-chunks').textContent();
      expect(chunksText).not.toBe('-');
    });
  });

  test.describe('Sources/Docs Display', () => {
    test('docs endpoint returns valid response', async ({ page }) => {
      await page.goto('/');
      
      const response = await page.request.get('/api/docs');
      expect(response.ok()).toBeTruthy();
      
      const data = await response.json();
      expect(data).toHaveProperty('docs');
      expect(data).toHaveProperty('totalSources');
    });
  });

  test.describe('Navigation Between Tabs', () => {
    test('can navigate to all tabs', async ({ page }) => {
      await page.goto('/');
      
      const tabs = ['overview', 'search', 'gateway', 'skills', 'tools', 'activity', 'settings'];
      
      for (const tab of tabs) {
        await page.click(`#nav-${tab}`);
        await expect(page.locator(`#tab-${tab}`)).toBeVisible();
        
        const navLink = page.locator(`#nav-${tab}`);
        await expect(navLink).toHaveClass(/bg-gray-800/);
      }
    });

    test('quick action buttons navigate correctly', async ({ page }) => {
      await page.goto('/');
      
      await page.click('button:has-text("Search Knowledge Base")');
      await expect(page.locator('#tab-search')).toBeVisible();
      
      await page.click('#nav-overview');
      await page.click('button:has-text("Browse Gateway Tools")');
      await expect(page.locator('#tab-gateway')).toBeVisible();
      
      await page.click('#nav-overview');
      await page.click('button:has-text("Browse Skills")');
      await expect(page.locator('#tab-skills')).toBeVisible();
    });
  });

  test.describe('Error States', () => {
    test('handles API errors gracefully', async ({ page }) => {
      await page.route('**/api/stats', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });
      
      await page.goto('/');
      
      await expect(page.locator('#app')).toBeVisible();
    });

    test('displays connection status correctly', async ({ page }) => {
      await page.goto('/');
      
      await expect(page.locator('#status-dot')).toBeVisible();
      await expect(page.locator('#status-text')).toBeVisible();
    });
  });

  test.describe('Tools Tab', () => {
    test('tools tab displays tool registry', async ({ page }) => {
      await page.goto('/');
      await page.click('#nav-tools');
      
      await page.waitForSelector('#tab-tools:not(.hidden)', { timeout: 5000 });
      await expect(page.locator('#tab-tools h2:has-text("Tools")')).toBeVisible();
      await expect(page.locator('#tools-grid')).toBeVisible();
    });

    test('rules optimizer panel is visible', async ({ page }) => {
      await page.goto('/');
      await page.click('#nav-tools');
      
      await page.waitForSelector('#tab-tools:not(.hidden)', { timeout: 5000 });
      await expect(page.locator('text=Rules Optimizer')).toBeVisible();
      await expect(page.locator('#optimizer-folder')).toBeVisible();
    });
  });

  test.describe('Settings Tab', () => {
    test('settings tab displays configuration options', async ({ page }) => {
      await page.goto('/');
      await page.click('#nav-settings');
      
      await expect(page.locator('#tab-settings')).toBeVisible();
      await expect(page.locator('h2:has-text("Settings")')).toBeVisible();
      
      await expect(page.locator('#config-vectorstore')).toBeVisible();
      await expect(page.locator('#config-embeddings')).toBeVisible();
    });

    test('connection status check button works', async ({ page }) => {
      await page.goto('/');
      await page.click('#nav-settings');
      
      const checkButton = page.locator('button:has-text("Check")');
      await expect(checkButton).toBeVisible();
      await checkButton.click();
      
      await page.waitForTimeout(1000);
      await expect(page.locator('#vectorstore-status-text')).not.toHaveText('Checking...');
    });
  });
});

test.describe('Dashboard Responsive Layout - CRR-1110', () => {
  test('mobile viewport shows sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    await expect(page.locator('aside')).toBeVisible();
    await expect(page.locator('#app')).toBeVisible();
  });

  test('stat cards stack on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    const statsGrid = page.locator('.grid').first();
    await expect(statsGrid).toBeVisible();
  });

  test('search input adapts to viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.click('#nav-search');
    await page.waitForSelector('#tab-search:not(.hidden)', { timeout: 5000 });
    
    const searchInput = page.locator('#search-input');
    await expect(searchInput).toBeVisible();
    
    const box = await searchInput.boundingBox();
    expect(box).toBeTruthy();
  });
});
