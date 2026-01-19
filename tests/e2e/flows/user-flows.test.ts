import { test, expect } from '@playwright/test';

test.describe('Full User Flows - CRR-1111', () => {
  test.describe('Flow: Search → View Results', () => {
    test('complete search flow', async ({ page }) => {
      await page.goto('/');
      
      await page.click('#nav-search');
      await page.waitForSelector('#tab-search:not(.hidden)', { timeout: 5000 });
      
      await page.fill('#search-input', 'test documentation');
      await page.click('#tab-search button:has-text("Search")');
      
      await expect(page.locator('#search-results')).toBeVisible();
    });

    test('search results persist on tab switch', async ({ page }) => {
      await page.goto('/');
      await page.click('#nav-search');
      await page.waitForSelector('#tab-search:not(.hidden)', { timeout: 5000 });
      
      const testQuery = 'memory metadata store';
      await page.fill('#search-input', testQuery);
      await page.click('#tab-search button:has-text("Search")');
      
      const inputValue = await page.locator('#search-input').inputValue();
      expect(inputValue).toBe(testQuery);
    });
  });

  test.describe('Flow: Dashboard Navigation', () => {
    test('navigate from overview to search', async ({ page }) => {
      await page.goto('/');
      
      await expect(page.locator('#tab-overview')).toBeVisible();
      
      await page.click('button:has-text("Search Knowledge Base")');
      await page.waitForSelector('#tab-search:not(.hidden)', { timeout: 5000 });
      
      await expect(page.locator('#search-input')).toBeVisible();
    });
  });

  test.describe('Flow: MCP Gateway Tools', () => {
    test('browse gateway tools from dashboard', async ({ page }) => {
      await page.goto('/');
      
      await page.click('#nav-gateway');
      await page.waitForSelector('#tab-gateway:not(.hidden)', { timeout: 5000 });
      
      await expect(page.locator('#gateway-tools-list')).toBeVisible();
    });

    test('search gateway tools', async ({ page }) => {
      await page.goto('/');
      await page.click('#nav-gateway');
      await page.waitForSelector('#tab-gateway:not(.hidden)', { timeout: 5000 });
      
      await page.fill('#gateway-search-input', 'linear');
      await page.click('#tab-gateway button:has-text("Search")');
      
      await expect(page.locator('#gateway-tools-list')).toBeVisible();
    });
  });

  test.describe('Flow: Activity Log Monitoring', () => {
    test('activity log displays operations', async ({ page }) => {
      await page.goto('/');
      
      await page.click('#nav-activity');
      await page.waitForSelector('#tab-activity:not(.hidden)', { timeout: 5000 });
      
      await expect(page.locator('#activity-log')).toBeVisible();
    });

    test('recent activity in overview', async ({ page }) => {
      await page.goto('/');
      
      await expect(page.locator('#recent-activity')).toBeVisible();
    });
  });

  test.describe('Flow: Settings Configuration', () => {
    test('view and modify settings', async ({ page }) => {
      await page.goto('/');
      await page.click('#nav-settings');
      await page.waitForSelector('#tab-settings:not(.hidden)', { timeout: 5000 });
      
      const vectorStoreSelect = page.locator('#config-vectorstore');
      await expect(vectorStoreSelect).toBeVisible();
      
      const embeddingsSelect = page.locator('#config-embeddings');
      await expect(embeddingsSelect).toBeVisible();
      
      const saveButton = page.locator('button:has-text("Save Settings")');
      await expect(saveButton).toBeVisible();
    });

    test('vector store config toggles fields', async ({ page }) => {
      await page.goto('/');
      await page.click('#nav-settings');
      await page.waitForSelector('#tab-settings:not(.hidden)', { timeout: 5000 });
      
      await page.selectOption('#config-vectorstore', 'chroma');
      await expect(page.locator('#chroma-config')).toBeVisible();
      
      await page.selectOption('#config-vectorstore', 'memory');
      await expect(page.locator('#chroma-config')).toBeHidden();
    });
  });

  test.describe('Flow: Tools and Rules Optimizer', () => {
    test('tools tab accessible', async ({ page }) => {
      await page.goto('/');
      await page.click('#nav-tools');
      await page.waitForSelector('#tab-tools:not(.hidden)', { timeout: 5000 });
      
      await expect(page.locator('#tools-grid')).toBeVisible();
    });

    test('rules optimizer panel accessible', async ({ page }) => {
      await page.goto('/');
      await page.click('#nav-tools');
      await page.waitForSelector('#tab-tools:not(.hidden)', { timeout: 5000 });
      
      await expect(page.locator('#optimizer-folder')).toBeVisible();
      await expect(page.locator('#optimizer-mode')).toBeVisible();
      await expect(page.locator('#optimizer-run-btn')).toBeVisible();
    });

    test('can set rules folder path', async ({ page }) => {
      await page.goto('/');
      await page.click('#nav-tools');
      await page.waitForSelector('#tab-tools:not(.hidden)', { timeout: 5000 });
      
      await page.fill('#optimizer-folder', '~/.cursor/rules');
      
      const inputValue = await page.locator('#optimizer-folder').inputValue();
      expect(inputValue).toBe('~/.cursor/rules');
    });
  });

  test.describe('Flow: Skills Discovery', () => {
    test('browse OpenSkills', async ({ page }) => {
      await page.goto('/');
      await page.click('#nav-skills');
      await page.waitForSelector('#tab-skills:not(.hidden)', { timeout: 5000 });
      
      await expect(page.locator('#skills-list')).toBeVisible();
    });
  });
});

test.describe('Performance Tests - CRR-1111', () => {
  test('dashboard initial load time is acceptable', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/');
    await expect(page.locator('#app')).toBeVisible();
    
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(10000);
    
    console.log(`Dashboard load time: ${loadTime}ms`);
  });

  test('tab switching is responsive', async ({ page }) => {
    await page.goto('/');
    
    const tabs = ['search', 'gateway', 'tools', 'activity', 'settings', 'overview'];
    
    for (const tab of tabs) {
      const startTime = Date.now();
      await page.click(`#nav-${tab}`);
      await page.waitForSelector(`#tab-${tab}:not(.hidden)`, { timeout: 5000 });
      const switchTime = Date.now() - startTime;
      
      expect(switchTime).toBeLessThan(2000);
    }
  });
});

test.describe('API Integration Tests - CRR-1111', () => {
  test('stats API returns valid data', async ({ page }) => {
    await page.goto('/');
    
    const response = await page.request.get('/api/stats');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data).toHaveProperty('vectorStore');
    expect(data).toHaveProperty('embeddings');
    expect(data).toHaveProperty('totalChunks');
  });

  test('activity API returns array', async ({ page }) => {
    await page.goto('/');
    
    const response = await page.request.get('/api/activity');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('health API checks connections', async ({ page }) => {
    await page.goto('/');
    
    const response = await page.request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data).toHaveProperty('vectorStore');
    expect(data).toHaveProperty('embeddings');
    expect(data.vectorStore).toHaveProperty('status');
    expect(data.embeddings).toHaveProperty('status');
  });

  test('tools API returns tool list', async ({ page }) => {
    await page.goto('/');
    
    const response = await page.request.get('/api/tools');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data).toHaveProperty('tools');
    expect(data).toHaveProperty('categories');
    expect(Array.isArray(data.tools)).toBeTruthy();
  });

  test('config API returns safe config', async ({ page }) => {
    await page.goto('/');
    
    const response = await page.request.get('/api/config');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    
    if (data.apiKeys?.openai) {
      expect(data.apiKeys.openai).toBe('***configured***');
    }
  });
});

test.describe('Error Handling Flows - CRR-1111', () => {
  test('handles network errors gracefully', async ({ page }) => {
    await page.route('**/api/stats', route => route.abort());
    
    await page.goto('/');
    
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('aside')).toBeVisible();
  });

  test('handles empty search results', async ({ page }) => {
    await page.goto('/');
    await page.click('#nav-search');
    await page.waitForSelector('#tab-search:not(.hidden)', { timeout: 5000 });
    
    await page.route('**/api/search', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    
    await page.fill('#search-input', 'nonexistent query xyz123');
    await page.click('#tab-search button:has-text("Search")');
    
    await expect(page.locator('#search-results')).toBeVisible();
  });
});
