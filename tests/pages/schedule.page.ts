import { Page, Locator, expect } from '@playwright/test'

export class SchedulePage {
    readonly page: Page
    readonly createButton: Locator
    readonly shiftsTable: Locator
    readonly calendar: Locator
    readonly listViewButton: Locator
    readonly calendarViewButton: Locator
    readonly modal: Locator
    readonly monthSelector: Locator
    readonly teamFilter: Locator

    constructor(page: Page) {
        this.page = page
        this.createButton = page.locator('button:has-text("Neue Schicht")')
        this.shiftsTable = page.locator('table')
        this.calendar = page.locator('[class*="grid-cols-7"]')
        this.listViewButton = page.locator('button:has-text("Liste")')
        this.calendarViewButton = page.locator('button:has-text("Kalender")')
        this.modal = page.locator('[class*="fixed inset-0"]')
        this.monthSelector = page.locator('select').first()
        this.teamFilter = page.locator('select').last()
    }

    async goto() {
        await this.page.goto('/admin/schedule')
        await this.page.waitForLoadState('domcontentloaded')
        // Warte auf spezifisches UI-Element das anzeigt dass die Seite geladen ist
        await this.page.waitForSelector('h1, [data-testid="page-loaded"], button:has-text("Neue Schicht")', { timeout: 15000 })
    }

    async switchToListView() {
        await this.listViewButton.click()
        await this.page.waitForTimeout(300)
    }

    async switchToCalendarView() {
        await this.calendarViewButton.click()
        await this.page.waitForTimeout(300)
    }

    async navigateMonth(direction: 'prev' | 'next') {
        const button = direction === 'prev'
            ? this.page.locator('button:has-text("<"), button:has-text("Zurück")')
            : this.page.locator('button:has-text(">"), button:has-text("Weiter")')
        await button.click()
        await this.page.waitForTimeout(500)
    }

    async createSingleShift(data: {
        employeeId: string
        date: string
        plannedStart: string
        plannedEnd: string
        backupEmployeeId?: string
        note?: string
    }) {
        await this.createButton.click()
        await this.modal.waitFor({ state: 'visible' })

        // Fill form
        await this.modal.locator('select').first().selectOption(data.employeeId)
        await this.modal.locator('input[type="date"]').fill(data.date)
        await this.modal.locator('input[type="time"]').first().fill(data.plannedStart)
        await this.modal.locator('input[type="time"]').last().fill(data.plannedEnd)

        if (data.backupEmployeeId) {
            const backupSelect = this.modal.locator('select').nth(1)
            await backupSelect.selectOption(data.backupEmployeeId)
        }

        if (data.note) {
            await this.modal.locator('textarea').fill(data.note)
        }

        await this.modal.locator('button:has-text("Speichern")').click()
        await this.modal.waitFor({ state: 'hidden' })
    }

    async createRepeatingShift(data: {
        employeeId: string
        startDate: string
        endDate: string
        plannedStart: string
        plannedEnd: string
        repeatDays: number[] // 0=Sun, 1=Mon, etc.
        backupEmployeeId?: string
    }) {
        await this.createButton.click()
        await this.modal.waitFor({ state: 'visible' })

        // Fill basic info
        await this.modal.locator('select').first().selectOption(data.employeeId)
        await this.modal.locator('input[type="date"]').first().fill(data.startDate)
        await this.modal.locator('input[type="time"]').first().fill(data.plannedStart)
        await this.modal.locator('input[type="time"]').last().fill(data.plannedEnd)

        if (data.backupEmployeeId) {
            await this.modal.locator('select').nth(1).selectOption(data.backupEmployeeId)
        }

        // Enable repeat
        await this.modal.locator('text=Schicht wiederholen').click()

        // Set end date
        await this.modal.locator('input[type="date"]').last().fill(data.endDate)

        // Select days (toggles)
        const dayButtons = this.modal.locator('[class*="w-10 h-10"], [class*="rounded-full"]')
        const dayLabels = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

        for (const day of data.repeatDays) {
            const dayButton = this.modal.locator(`button:has-text("${dayLabels[day]}")`)
            await dayButton.click()
        }

        await this.modal.locator('button:has-text("Speichern")').click()
        await this.modal.waitFor({ state: 'hidden' })
    }

    async editShift(index: number, data: {
        plannedStart?: string
        plannedEnd?: string
        backupEmployeeId?: string
    }) {
        const editButtons = this.shiftsTable.locator('[class*="Edit"], button:has(svg)')
        await editButtons.nth(index).click()

        await this.modal.waitFor({ state: 'visible' })

        if (data.plannedStart) {
            await this.modal.locator('input[type="time"]').first().fill(data.plannedStart)
        }
        if (data.plannedEnd) {
            await this.modal.locator('input[type="time"]').last().fill(data.plannedEnd)
        }
        if (data.backupEmployeeId) {
            await this.modal.locator('select').nth(1).selectOption(data.backupEmployeeId)
        }

        await this.modal.locator('button:has-text("Speichern")').click()
        await this.modal.waitFor({ state: 'hidden' })
    }

    async deleteShift(index: number) {
        const deleteButtons = this.shiftsTable.locator('[class*="Trash"], button:has(svg[class*="trash"])')
        await deleteButtons.nth(index).click()

        // Handle confirmation dialog
        this.page.on('dialog', dialog => dialog.accept())
        await this.page.waitForTimeout(500)
    }

    async getShiftCount(): Promise<number> {
        return await this.shiftsTable.locator('tbody tr').count()
    }

    async expectShiftExists(employeeName: string, date: string) {
        await expect(this.shiftsTable.locator(`tr:has-text("${employeeName}"):has-text("${date}")`)).toBeVisible()
    }
}
