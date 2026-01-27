import { Page, Locator, expect } from '@playwright/test'

export class DashboardPage {
    readonly page: Page
    readonly header: Locator
    readonly monthSelector: Locator
    readonly totalHours: Locator
    readonly submitButton: Locator
    readonly timesheetCards: Locator
    readonly backupSection: Locator
    readonly loadingIndicator: Locator

    constructor(page: Page) {
        this.page = page
        this.header = page.locator('header')
        this.monthSelector = page.locator('select').first()
        this.totalHours = page.locator('text=/\\d+[,.]?\\d*\\s*Std/')
        this.submitButton = page.locator('text=Mit Unterschrift einreichen')
        this.timesheetCards = page.locator('[class*="rounded-2xl"][class*="bg-white"][class*="shadow"]')
        this.backupSection = page.locator('text=Backup-Schichten')
        this.loadingIndicator = page.locator('text=Lade Daten...')
    }

    async goto() {
        await this.page.goto('/dashboard')
        await this.waitForLoad()
    }

    async waitForLoad() {
        // Wait for loading to finish
        await this.page.waitForLoadState('networkidle')
        await this.loadingIndicator.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => { })
    }

    async selectMonth(month: number, year: number) {
        await this.monthSelector.selectOption(`${year}-${month}`)
        await this.waitForLoad()
    }

    // Shift interactions
    async getShiftCard(dayIndex: number): Promise<Locator> {
        return this.timesheetCards.nth(dayIndex)
    }

    async confirmShift(dayIndex: number) {
        const card = await this.getShiftCard(dayIndex)
        const confirmButton = card.locator('button:has-text("Bestätigen")')
        await confirmButton.click()
        await this.page.waitForTimeout(500)
    }

    async editShift(dayIndex: number, options: {
        actualStart?: string
        actualEnd?: string
        absenceType?: 'SICK' | 'VACATION' | ''
        note?: string
    }) {
        const card = await this.getShiftCard(dayIndex)

        // Click edit button (pencil icon)
        const editButton = card.locator('button').filter({ has: this.page.locator('svg') }).first()
        await editButton.click()

        // Wait for edit mode
        await this.page.waitForTimeout(300)

        // Fill form fields
        if (options.actualStart !== undefined) {
            const startInput = card.locator('input[type="time"]').first()
            await startInput.fill(options.actualStart)
        }
        if (options.actualEnd !== undefined) {
            const endInput = card.locator('input[type="time"]').last()
            await endInput.fill(options.actualEnd)
        }
        if (options.absenceType !== undefined) {
            const select = card.locator('select')
            await select.selectOption(options.absenceType)
        }
        if (options.note !== undefined) {
            const textarea = card.locator('textarea')
            await textarea.fill(options.note)
        }

        // Save
        const saveButton = card.locator('button:has-text("Speichern"), button:has-text("UPDATE")')
        await saveButton.click()
        await this.page.waitForTimeout(500)
    }

    async markSick(dayIndex: number) {
        await this.editShift(dayIndex, { absenceType: 'SICK' })
    }

    async markVacation(dayIndex: number) {
        await this.editShift(dayIndex, { absenceType: 'VACATION' })
    }

    async unconfirmShift(dayIndex: number) {
        const card = await this.getShiftCard(dayIndex)
        const resetButton = card.locator('button:has-text("Zurücksetzen")')
        await resetButton.click()
        await this.page.waitForTimeout(500)
    }

    // Assertions
    async expectShiftStatus(dayIndex: number, status: string) {
        const card = await this.getShiftCard(dayIndex)
        await expect(card.locator(`text=${status}`)).toBeVisible({ timeout: 5000 })
    }

    async expectBackupShiftVisible() {
        await expect(this.backupSection).toBeVisible()
    }

    async expectNoBackupShifts() {
        await expect(this.backupSection).not.toBeVisible()
    }

    async getShiftCount(): Promise<number> {
        return await this.timesheetCards.count()
    }

    // Submission
    async submitMonth() {
        await this.submitButton.click()

        // Modal appears - signature
        const canvas = this.page.locator('canvas')
        await canvas.waitFor({ state: 'visible' })

        // Draw signature
        const box = await canvas.boundingBox()
        if (box) {
            await this.page.mouse.move(box.x + 50, box.y + 50)
            await this.page.mouse.down()
            await this.page.mouse.move(box.x + 100, box.y + 100)
            await this.page.mouse.up()
        }

        // Submit
        await this.page.locator('button:has-text("Einreichen")').click()
        await this.page.waitForTimeout(1000)
    }

    async expectSubmitted() {
        await expect(this.page.locator('text=Monat erfolgreich eingereicht')).toBeVisible()
    }
}
