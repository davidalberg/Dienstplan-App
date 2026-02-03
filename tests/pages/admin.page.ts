import { Page, Locator, expect } from '@playwright/test'

export class AdminPage {
    readonly page: Page
    readonly header: Locator
    readonly syncButton: Locator
    readonly exportButton: Locator
    readonly shiftsTable: Locator
    readonly filterMonth: Locator
    readonly filterYear: Locator
    readonly filterEmployee: Locator
    readonly dienstplanGroups: Locator

    constructor(page: Page) {
        this.page = page
        this.header = page.locator('h1:has-text("Admin Panel")')
        this.syncButton = page.locator('text=Importieren')
        this.exportButton = page.locator('text=Exportieren')
        this.shiftsTable = page.locator('table')
        this.filterMonth = page.locator('input[type="number"]').first()
        this.filterYear = page.locator('input[type="number"]').nth(1)
        this.filterEmployee = page.locator('select').filter({ hasText: 'Alle Mitarbeiter' })
        this.dienstplanGroups = page.locator('[class*="rounded-xl border"]')
    }

    async goto() {
        await this.page.goto('/admin')
        await this.page.waitForLoadState('domcontentloaded')
        // Warte auf spezifisches UI-Element das anzeigt dass die Seite geladen ist
        await this.page.waitForSelector('h1, [data-testid="page-loaded"], nav', { timeout: 15000 })
    }

    async navigateToScheduleEditor() {
        await this.page.locator('text=Kalender').click()
        await this.page.waitForURL('**/admin/schedule')
    }

    async navigateToEmployees() {
        await this.page.locator('text=Assistenten').click()
        await this.page.waitForURL('**/admin/assistants')
    }

    async navigateToSubmissions() {
        await this.page.locator('text=Stundennachweise').click()
        await this.page.waitForURL('**/admin/submissions')
    }

    async expandDienstplan(name: string) {
        await this.page.locator(`text=${name}`).click()
    }

    async editShift(index: number, data: {
        plannedStart?: string
        plannedEnd?: string
        actualStart?: string
        actualEnd?: string
        status?: string
        absenceType?: string
    }) {
        // Click edit button on row
        const editButtons = this.page.locator('[class*="Edit"], button:has(svg[class*="edit"])')
        await editButtons.nth(index).click()

        // Wait for modal
        const modal = this.page.locator('[class*="fixed inset-0"]')
        await modal.waitFor({ state: 'visible' })

        // Fill modal fields
        if (data.plannedStart) {
            await modal.locator('input[type="time"]').first().fill(data.plannedStart)
        }
        if (data.plannedEnd) {
            await modal.locator('input[type="time"]').nth(1).fill(data.plannedEnd)
        }
        if (data.status) {
            await modal.locator('select').first().selectOption(data.status)
        }
        if (data.absenceType) {
            await modal.locator('select').last().selectOption(data.absenceType)
        }

        await modal.locator('button:has-text("Speichern")').click()
        await modal.waitFor({ state: 'hidden' })
    }

    async deleteShift(index: number) {
        const deleteButtons = this.page.locator('[class*="Trash"], button:has(svg[class*="trash"])')
        await deleteButtons.nth(index).click()

        // Handle confirmation dialog
        this.page.on('dialog', dialog => dialog.accept())
        await this.page.waitForTimeout(500)
    }

    async bulkDeleteShifts(count: number) {
        // Select checkboxes
        const checkboxes = this.page.locator('input[type="checkbox"]')
        for (let i = 0; i < count; i++) {
            await checkboxes.nth(i + 1).check() // Skip header checkbox
        }

        await this.page.locator('text=Ausgewählte löschen').click()

        // Handle confirmation
        this.page.on('dialog', dialog => dialog.accept())
        await this.page.waitForTimeout(500)
    }

    async setFilter(month: number, year: number) {
        await this.filterMonth.fill(String(month))
        await this.filterYear.fill(String(year))
        await this.page.waitForTimeout(500)
    }
}
