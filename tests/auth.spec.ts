import { test, expect } from './fixtures'

test.describe('Authentifizierung', () => {
    test.beforeEach(async ({ page }) => {
        // Clear cookies to ensure fresh login
        await page.context().clearCookies()
    })

    test('Login als ADMIN redirectet zu /admin', async ({ loginPage, testUsers }) => {
        await loginPage.goto()
        await loginPage.login(testUsers.admin.email, testUsers.admin.password)
        await expect(loginPage.page).toHaveURL(/\/admin/)
    })

    test('Login als EMPLOYEE redirectet zu /dashboard', async ({ loginPage, testUsers }) => {
        await loginPage.goto()
        await loginPage.login(testUsers.employee.email, testUsers.employee.password)
        await expect(loginPage.page).toHaveURL(/\/dashboard/)
    })

    test('Login als TEAMLEAD redirectet zu /dashboard', async ({ loginPage, testUsers }) => {
        await loginPage.goto()
        await loginPage.login(testUsers.teamlead.email, testUsers.teamlead.password)
        await expect(loginPage.page).toHaveURL(/\/dashboard/)
    })

    test('Falsches Passwort zeigt Fehlermeldung', async ({ loginPage, testUsers }) => {
        await loginPage.goto()
        await loginPage.login(testUsers.admin.email, 'falsches-passwort')
        await loginPage.expectError()
    })

    test('Unbekannter Benutzer zeigt Fehlermeldung', async ({ loginPage }) => {
        await loginPage.goto()
        await loginPage.login('unknown@test.de', 'test123')
        await loginPage.expectError()
    })

    test('Geschützte API ohne Login gibt 401 zurück', async ({ page }) => {
        // Teste API direkt statt UI-Redirect
        const response = await page.request.get('/api/timesheets?month=1&year=2026')
        expect(response.status()).toBe(401)
    })

    test('Admin-API ohne Login gibt 401 zurück', async ({ page }) => {
        // Teste API direkt statt UI-Redirect
        const response = await page.request.get('/api/admin/timesheets?month=1&year=2026')
        expect(response.status()).toBe(401)
    })

    test('Logout funktioniert korrekt', async ({ loginPage, testUsers, page }) => {
        await loginPage.goto()
        await loginPage.login(testUsers.employee.email, testUsers.employee.password)
        await loginPage.expectLoggedIn()

        await loginPage.logout()
        await expect(page).toHaveURL(/\/login/)
    })
})
