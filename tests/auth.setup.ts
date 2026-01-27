import { test as setup } from '@playwright/test'
import path from 'path'

const adminAuthFile = path.join(__dirname, '.auth/admin.json')
const employeeAuthFile = path.join(__dirname, '.auth/employee.json')

setup('authenticate as admin', async ({ page }) => {
    await page.goto('/login')

    await page.locator('input[type="email"]').fill(process.env.TEST_ADMIN_EMAIL || 'admin@test.de')
    await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD || 'test123')
    await page.locator('button[type="submit"]').click()

    // Wait for redirect to admin page
    await page.waitForURL('**/admin', { timeout: 15000 })

    // Save authentication state
    await page.context().storageState({ path: adminAuthFile })
})

setup('authenticate as employee', async ({ page }) => {
    await page.goto('/login')

    await page.locator('input[type="email"]').fill(process.env.TEST_EMPLOYEE_EMAIL || 'mitarbeiter@test.de')
    await page.locator('input[type="password"]').fill(process.env.TEST_EMPLOYEE_PASSWORD || 'test123')
    await page.locator('button[type="submit"]').click()

    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard', { timeout: 15000 })

    // Save authentication state
    await page.context().storageState({ path: employeeAuthFile })
})
