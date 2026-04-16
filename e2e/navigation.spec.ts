import { test, expect } from '@playwright/test'

test.describe('Home page', () => {
  test('loads and shows heading', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible()
  })

  test('shows tag filter buttons', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible()
  })

  test('shows article cards or empty state', async ({ page }) => {
    await page.goto('/')
    // Either articles load or empty state is shown
    const hasArticles = await page.locator('[data-slot="card"]').count()
    const hasEmpty = await page.getByText('No articles found').isVisible().catch(() => false)
    expect(hasArticles > 0 || hasEmpty).toBeTruthy()
  })
})

test.describe('Search page', () => {
  test('loads search page', async ({ page }) => {
    await page.goto('/search')
    await expect(page.getByPlaceholder(/search/i)).toBeVisible()
  })

  test('search with query returns results or empty', async ({ page }) => {
    await page.goto('/search')
    const input = page.getByPlaceholder(/search/i)
    await input.fill('AI')
    await input.press('Enter')
    // Wait for results or "no results" text
    await page.waitForTimeout(1000)
    const hasResults = await page.locator('[data-slot="card"]').count()
    const hasEmpty = await page.getByText(/no.*found/i).isVisible().catch(() => false)
    expect(hasResults > 0 || hasEmpty).toBeTruthy()
  })
})

test.describe('Article detail', () => {
  test('navigates to article from home', async ({ page }) => {
    await page.goto('/')
    const firstLink = page.locator('a[href^="/article/"]').first()
    const linkVisible = await firstLink.isVisible().catch(() => false)
    if (linkVisible) {
      await firstLink.click()
      await expect(page).toHaveURL(/\/article\//)
      // Article page should have a heading
      await expect(page.locator('h1')).toBeVisible()
    }
  })
})

test.describe('Watchlist page', () => {
  test('loads watchlist page', async ({ page }) => {
    await page.goto('/watchlist')
    await expect(page.getByText(/watched/i)).toBeVisible()
  })
})
