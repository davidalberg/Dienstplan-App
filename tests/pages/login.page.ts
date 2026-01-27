import { Page, Locator, expect } from '@playwright/test'

export class LoginPage {
    readonly page: Page
    readonly emailInput: Locator
    readonly passwordInput: Locator
    readonly submitButton: Locator
    readonly errorMessage: Locator
    readonly loadingIndicator: Locator

    constructor(page: Page) {
        this.page = page
        this.emailInput = page.locator('input[type="email"]')
        this.passwordInput = page.locator('input[type="password"]')
        this.submitButton = page.locator('button[type="submit"]')
        this.errorMessage = page.locator('.bg-red-50, .text-red-600')
        this.loadingIndicator = page.locator('text=Anmeldung...')
    }

    async goto() {
        await this.page.goto('/login')
    }

    async login(email: string, password: string) {
        await this.emailInput.fill(email)
        await this.passwordInput.fill(password)
        await this.submitButton.click()

        // Wait for redirect or error message
        await Promise.race([
            this.page.waitForURL('**/dashboard', { timeout: 10000 }),
            this.page.waitForURL('**/admin', { timeout: 10000 }),
            this.page.waitForURL('**/teamlead', { timeout: 10000 }),
            this.errorMessage.waitFor({ timeout: 5000 }).catch(() => { }),
        ])
    }

    async expectError(message?: string) {
        await expect(this.errorMessage).toBeVisible()
        if (message) {
            await expect(this.errorMessage).toContainText(message)
        }
    }

    async expectLoggedIn() {
        await expect(this.page).not.toHaveURL('/login')
    }

    async logout() {
        // Look for logout button in different locations
        const logoutButton = this.page.locator('text=Abmelden').first()
        if (await logoutButton.isVisible()) {
            await logoutButton.click()
            await this.page.waitForURL('**/login')
        }
    }
}
