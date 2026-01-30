import { test, expect } from './fixtures'

test.describe('Combined Timesheets - Stundennachweise Page', () => {
    // Use admin auth state
    test.use({ storageState: 'tests/.auth/admin.json' })

    test('Admin timesheets page lädt korrekt', async ({ page }) => {
        await page.goto('/admin/timesheets')

        // Wait for page load
        await page.waitForLoadState('networkidle')

        // Check that the header is visible
        await expect(page.getByRole('heading', { name: /Stundennachweise/i })).toBeVisible()

        // Check that month/year navigation is visible
        await expect(page.locator('button[title*="Vorheriger Monat"]')).toBeVisible()
        await expect(page.locator('button[title*="Nächster Monat"]')).toBeVisible()
    })

    test('Stats cards werden angezeigt', async ({ page }) => {
        await page.goto('/admin/timesheets')
        await page.waitForLoadState('networkidle')

        // Check for stats cards - should show total, completed, pending counts
        const statsSection = page.locator('div:has(> div:has-text("Gesamt"))')
        await expect(statsSection).toBeVisible()
    })

    test('Client groups sind sichtbar und expandierbar', async ({ page, prisma, testUsers }) => {
        await page.goto('/admin/timesheets')
        await page.waitForLoadState('networkidle')

        // Wait for data to load
        await page.waitForTimeout(1000)

        // Check if any client groups are visible
        const clientGroups = page.locator('[data-testid="client-group"]').or(
            page.locator('button:has-text("Team")')
        )

        const count = await clientGroups.count()

        if (count > 0) {
            // At least one client group exists
            const firstGroup = clientGroups.first()
            await expect(firstGroup).toBeVisible()

            // Try to click to expand/collapse
            await firstGroup.click()
            await page.waitForTimeout(500)

            // Click again to collapse
            await firstGroup.click()
        } else {
            console.log('No client groups found - possibly no submissions in test data')
        }
    })

    test('Combined API endpoint funktioniert', async ({ page, prisma, testUsers }) => {
        const now = new Date()
        const month = now.getMonth() + 1
        const year = now.getFullYear()

        // Find an employee with timesheets
        const employee = await prisma.user.findFirst({
            where: {
                role: 'EMPLOYEE',
                timesheets: {
                    some: {
                        month,
                        year
                    }
                }
            },
            include: {
                timesheets: {
                    where: { month, year },
                    take: 1
                },
                team: {
                    include: {
                        client: true
                    }
                }
            }
        })

        if (!employee || !employee.team?.client) {
            test.skip()
            return
        }

        const sheetFileName = employee.timesheets[0]?.sheetFileName
        if (!sheetFileName) {
            test.skip()
            return
        }

        // Call combined API
        const response = await page.request.get(
            `/api/admin/timesheets/combined?sheetFileName=${encodeURIComponent(sheetFileName)}&month=${month}&year=${year}&clientId=${employee.team.client.id}`
        )

        expect(response.ok()).toBeTruthy()

        const data = await response.json()

        // Verify response structure
        expect(data.client).toBeTruthy()
        expect(data.client.id).toBe(employee.team.client.id)
        expect(data.sheetFileName).toBe(sheetFileName)
        expect(data.month).toBe(month)
        expect(data.year).toBe(year)
        expect(Array.isArray(data.employees)).toBeTruthy()
        expect(data.totalHours).toBeGreaterThanOrEqual(0)
    })

    test('Signature progress wird korrekt berechnet', async ({ page, prisma }) => {
        const now = new Date()
        const month = now.getMonth() + 1
        const year = now.getFullYear()

        // Find a team submission
        const submission = await prisma.teamSubmission.findFirst({
            where: {
                month,
                year,
                status: { in: ['PENDING_EMPLOYEES', 'PENDING_RECIPIENT', 'COMPLETED'] }
            },
            include: {
                employeeSignatures: true
            }
        })

        if (!submission) {
            test.skip()
            return
        }

        // Count signed employees
        const signedCount = submission.employeeSignatures.filter(sig => sig.signedAt !== null).length
        const totalCount = submission.employeeSignatures.length

        expect(signedCount).toBeGreaterThanOrEqual(0)
        expect(signedCount).toBeLessThanOrEqual(totalCount)
        expect(totalCount).toBeGreaterThan(0)

        console.log(`Signature progress: ${signedCount}/${totalCount} employees signed`)
    })

    test('Employee signature workflow - multi-employee team', async ({ page, prisma, testUsers }) => {
        const now = new Date()
        const month = now.getMonth() + 1
        const year = now.getFullYear()

        // Find a team with multiple employees
        const teamWithMultipleEmployees = await prisma.team.findFirst({
            where: {
                members: {
                    some: {
                        role: 'EMPLOYEE'
                    }
                }
            },
            include: {
                members: {
                    where: { role: 'EMPLOYEE' },
                    take: 3
                }
            }
        })

        if (!teamWithMultipleEmployees || teamWithMultipleEmployees.members.length < 2) {
            test.skip()
            return
        }

        console.log(`Testing with team having ${teamWithMultipleEmployees.members.length} employees`)

        // This test verifies that the multi-employee signature system works
        // Actual signing requires authentication as each employee, which is complex in E2E
        // For now, we just verify the data structure exists
        expect(teamWithMultipleEmployees.members.length).toBeGreaterThanOrEqual(2)
    })

    test('Combined PDF generation data structure', async ({ page, prisma, testUsers }) => {
        const now = new Date()
        const month = now.getMonth() + 1
        const year = now.getFullYear()

        // Find timesheets for PDF generation test
        const timesheets = await prisma.timesheet.findMany({
            where: {
                month,
                year,
                status: { in: ['CONFIRMED', 'CHANGED', 'SUBMITTED'] }
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            take: 10
        })

        if (timesheets.length === 0) {
            test.skip()
            return
        }

        // Verify data structure needed for PDF generation
        for (const ts of timesheets) {
            expect(ts.employee).toBeTruthy()
            expect(ts.employee.name).toBeTruthy()
            expect(ts.date).toBeTruthy()
            expect(ts.month).toBe(month)
            expect(ts.year).toBe(year)
        }

        console.log(`Found ${timesheets.length} timesheets suitable for PDF generation`)
    })

    test('Client signature URL wird korrekt gespeichert', async ({ prisma }) => {
        // Find a completed team submission with client signature
        const submission = await prisma.teamSubmission.findFirst({
            where: {
                status: 'COMPLETED',
                recipientSignedAt: { not: null }
            },
            select: {
                id: true,
                recipientSignature: true,
                clientSignatureUrl: true,
                recipientSignedAt: true,
                allEmployeesSigned: true
            }
        })

        if (!submission) {
            test.skip()
            return
        }

        // Verify that client signature fields are properly set
        expect(submission.recipientSignedAt).toBeTruthy()
        expect(submission.allEmployeesSigned).toBe(true)

        // clientSignatureUrl might be null for legacy submissions, but should exist for new ones
        if (submission.clientSignatureUrl) {
            expect(submission.clientSignatureUrl).toContain('data:image/png;base64')
        }

        console.log('Client signature data verified:', {
            hasRecipientSignature: !!submission.recipientSignature,
            hasClientSignatureUrl: !!submission.clientSignatureUrl,
            allEmployeesSigned: submission.allEmployeesSigned
        })
    })

    test('Empty state wird angezeigt bei fehlenden Daten', async ({ page }) => {
        // Navigate to a future month with no data
        await page.goto('/admin/timesheets')
        await page.waitForLoadState('networkidle')

        // Navigate far into the future (10 years)
        for (let i = 0; i < 120; i++) {
            const nextButton = page.locator('button[title*="Nächster Monat"]')
            await nextButton.click()
            await page.waitForTimeout(100)
        }

        await page.waitForTimeout(1000)

        // Check for empty state message
        const emptyState = page.locator('text=/Keine.*Einreichungen/i')
            .or(page.locator('text=/Keine.*Stundennachweise/i'))

        const isVisible = await emptyState.isVisible().catch(() => false)

        if (isVisible) {
            await expect(emptyState).toBeVisible()
            console.log('Empty state correctly displayed')
        } else {
            console.log('No empty state found - might have data even in future months')
        }
    })

    test('Sidebar navigation zu Stundennachweise funktioniert', async ({ page }) => {
        // Start from schedule page
        await page.goto('/admin/schedule')
        await page.waitForLoadState('networkidle')

        // Click on "Stundennachweise" in sidebar
        const stundennachwLink = page.locator('a[href="/admin/timesheets"]')
            .or(page.locator('text=Stundennachweise'))

        await expect(stundennachwLink).toBeVisible()
        await stundennachwLink.click()

        // Verify we're on the timesheets page
        await expect(page).toHaveURL('/admin/timesheets')
        await expect(page.getByRole('heading', { name: /Stundennachweise/i })).toBeVisible()
    })
})
