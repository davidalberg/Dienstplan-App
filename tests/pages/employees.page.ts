import { Page, Locator, expect } from '@playwright/test'

export class EmployeesPage {
    readonly page: Page
    readonly createButton: Locator
    readonly employeesTable: Locator
    readonly modal: Locator
    readonly teamGroups: Locator
    readonly searchInput: Locator

    constructor(page: Page) {
        this.page = page
        this.createButton = page.locator('button:has-text("Neuer Mitarbeiter")')
        this.employeesTable = page.locator('table')
        this.modal = page.locator('[class*="fixed inset-0"]')
        this.teamGroups = page.locator('[class*="bg-blue-50"]')
        this.searchInput = page.locator('input[placeholder*="Suche"]')
    }

    async goto() {
        await this.page.goto('/admin/employees')
        await this.page.waitForLoadState('networkidle')
    }

    async createEmployee(data: {
        name: string
        email: string
        password: string
        employeeId?: string
        team?: string
        hourlyWage?: number
    }) {
        await this.createButton.click()
        await this.modal.waitFor({ state: 'visible' })

        // Fill form - find inputs by label or placeholder
        await this.modal.locator('input[placeholder*="Name"], input').first().fill(data.name)
        await this.modal.locator('input[type="email"]').fill(data.email)
        await this.modal.locator('input[type="password"]').fill(data.password)

        if (data.employeeId) {
            await this.modal.locator('input[placeholder*="MA-ID"], input[placeholder*="Mitarbeiter"]').fill(data.employeeId)
        }
        if (data.team) {
            await this.modal.locator('select').first().selectOption(data.team)
        }
        if (data.hourlyWage) {
            const wageInput = this.modal.locator('input[type="number"]').first()
            await wageInput.fill(String(data.hourlyWage))
        }

        await this.modal.locator('button:has-text("Speichern")').click()
        await this.modal.waitFor({ state: 'hidden' })
    }

    async editEmployee(name: string, data: {
        hourlyWage?: number
        team?: string
        email?: string
    }) {
        // Find row with employee name
        const row = this.page.locator(`tr:has-text("${name}")`)
        const editButton = row.locator('[class*="Edit"], button:has(svg)').first()
        await editButton.click()

        await this.modal.waitFor({ state: 'visible' })

        if (data.hourlyWage !== undefined) {
            const wageInput = this.modal.locator('input[type="number"]').first()
            await wageInput.clear()
            await wageInput.fill(String(data.hourlyWage))
        }
        if (data.team) {
            await this.modal.locator('select').first().selectOption(data.team)
        }
        if (data.email) {
            await this.modal.locator('input[type="email"]').clear()
            await this.modal.locator('input[type="email"]').fill(data.email)
        }

        await this.modal.locator('button:has-text("Speichern")').click()
        await this.modal.waitFor({ state: 'hidden' })
    }

    async deleteEmployee(name: string) {
        const row = this.page.locator(`tr:has-text("${name}")`)
        const deleteButton = row.locator('[class*="Trash"], button:has(svg[class*="trash"])')
        await deleteButton.click()

        // Handle confirmation dialog
        this.page.on('dialog', dialog => dialog.accept())
        await this.page.waitForTimeout(500)
    }

    async expectVacationDays(name: string, minDays: number) {
        const row = this.page.locator(`tr:has-text("${name}")`)
        // Urlaubstage is the 5th column (0-indexed: 4)
        const vacationCell = row.locator('td').nth(4)
        const text = await vacationCell.textContent()
        const days = parseInt(text || '0')
        expect(days).toBeGreaterThanOrEqual(minDays)
    }

    async expectSickDays(name: string, minDays: number) {
        const row = this.page.locator(`tr:has-text("${name}")`)
        // Krankheitstage is the 6th column (0-indexed: 5)
        const sickCell = row.locator('td').nth(5)
        const text = await sickCell.textContent()
        const days = parseInt(text || '0')
        expect(days).toBeGreaterThanOrEqual(minDays)
    }

    async expectEmployeeExists(name: string) {
        await expect(this.page.locator(`tr:has-text("${name}")`)).toBeVisible()
    }

    async expectEmployeeNotExists(name: string) {
        await expect(this.page.locator(`tr:has-text("${name}")`)).not.toBeVisible()
    }

    async getEmployeeCount(): Promise<number> {
        return await this.employeesTable.locator('tbody tr').count()
    }
}
