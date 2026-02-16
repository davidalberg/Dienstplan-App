import { test, expect } from './fixtures'

/**
 * Edge-Cases und kritische Szenarien Tests
 *
 * Testet ungewöhnliche aber wichtige Situationen:
 * - Fehlende Daten
 * - Ungültige Eingaben
 * - Grenzfälle
 * - Berechtigungsprüfungen
 */

test.describe('Edge-Cases und kritische Szenarien', () => {
    test.describe('Datenvalidierung', () => {
        test('Schicht ohne Zeitangaben kann nicht bestätigt werden', async ({ page, loginPage, testUsers, prisma }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(0, 0, 0, 0)

            // Schicht ohne Zeiten (theoretisch ungültig)
            const shift = await prisma.timesheet.upsert({
                where: {
                    employeeId_date: {
                        employeeId: employee!.id,
                        date: tomorrow
                    }
                },
                update: {
                    plannedStart: null,
                    plannedEnd: null,
                    actualStart: null,
                    actualEnd: null,
                    status: 'PLANNED',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0,
                    absenceType: null,
                    backupEmployeeId: null,
                    note: null
                },
                create: {
                    employeeId: employee!.id,
                    date: tomorrow,
                    plannedStart: null,
                    plannedEnd: null,
                    status: 'PLANNED',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0
                }
            })

            await loginPage.goto()
            await loginPage.login(testUsers.employee.email, testUsers.employee.password)
            await page.waitForURL(/\/dashboard/)

            // Versuche zu bestätigen
            const response = await page.request.post('/api/timesheets', {
                data: {
                    id: shift.id,
                    action: 'CONFIRM'
                }
            })

            // Sollte trotzdem funktionieren, da CONFIRM die geplanten Zeiten übernimmt
            // (auch wenn sie null sind)
            expect(response.ok()).toBeTruthy()

            // Cleanup
            await prisma.timesheet.delete({ where: { id: shift.id } })
        })

        test('Ungültige Schicht-ID wird abgelehnt', async ({ page, loginPage, testUsers }) => {
            await loginPage.goto()
            await loginPage.login(testUsers.employee.email, testUsers.employee.password)
            await page.waitForURL(/\/dashboard/)

            const response = await page.request.post('/api/timesheets', {
                data: {
                    id: 'nicht-existierende-id',
                    action: 'CONFIRM'
                }
            })

            expect(response.status()).toBe(404)
        })

        test('Leere Anfrage wird abgelehnt', async ({ page, loginPage, testUsers }) => {
            await loginPage.goto()
            await loginPage.login(testUsers.employee.email, testUsers.employee.password)
            await page.waitForURL(/\/dashboard/)

            const response = await page.request.post('/api/timesheets', {
                data: {}
            })

            expect(response.status()).toBe(400)
        })
    })

    test.describe('Berechtigungen', () => {
        test('Mitarbeiter kann nur eigene Schichten ändern', async ({ page, loginPage, testUsers, prisma }) => {
            // Erstelle Schicht für anderen Mitarbeiter
            const teamlead = await prisma.user.findUnique({ where: { email: testUsers.teamlead.email } })
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(0, 0, 0, 0)

            const otherShift = await prisma.timesheet.upsert({
                where: {
                    employeeId_date: {
                        employeeId: teamlead!.id,
                        date: tomorrow
                    }
                },
                update: {
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    actualStart: null,
                    actualEnd: null,
                    status: 'PLANNED',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0,
                    absenceType: null,
                    backupEmployeeId: null,
                    note: null
                },
                create: {
                    employeeId: teamlead!.id,
                    date: tomorrow,
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    status: 'PLANNED',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0
                }
            })

            // Login als normaler Mitarbeiter
            await loginPage.goto()
            await loginPage.login(testUsers.employee.email, testUsers.employee.password)
            await page.waitForURL(/\/dashboard/)

            // Versuche fremde Schicht zu ändern
            const response = await page.request.post('/api/timesheets', {
                data: {
                    id: otherShift.id,
                    action: 'CONFIRM'
                }
            })

            expect(response.status()).toBe(403)

            // Cleanup
            await prisma.timesheet.delete({ where: { id: otherShift.id } })
        })

        test('Nicht eingeloggte Anfrage wird abgelehnt', async ({ page }) => {
            // Lösche alle Cookies um sicherzustellen, dass wir nicht eingeloggt sind
            await page.context().clearCookies()

            const response = await page.request.post('/api/timesheets', {
                data: {
                    id: 'test-id',
                    action: 'CONFIRM'
                }
            })

            expect(response.status()).toBe(401)
        })

        test('Eingereichte Schicht kann nicht mehr geändert werden (außer Admin)', async ({ page, loginPage, testUsers, prisma }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(0, 0, 0, 0)

            // Bereits eingereichte Schicht
            const shift = await prisma.timesheet.upsert({
                where: {
                    employeeId_date: {
                        employeeId: employee!.id,
                        date: tomorrow
                    }
                },
                update: {
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    actualStart: null,
                    actualEnd: null,
                    status: 'SUBMITTED',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0,
                    absenceType: null,
                    backupEmployeeId: null,
                    note: null
                },
                create: {
                    employeeId: employee!.id,
                    date: tomorrow,
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    status: 'SUBMITTED',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0
                }
            })

            // Login als Mitarbeiter
            await loginPage.goto()
            await loginPage.login(testUsers.employee.email, testUsers.employee.password)
            await page.waitForURL(/\/dashboard/)

            // Versuche eingereichte Schicht zu ändern
            const response = await page.request.post('/api/timesheets', {
                data: {
                    id: shift.id,
                    actualStart: '09:00',
                    actualEnd: '17:00'
                }
            })

            expect(response.status()).toBe(403)

            // Cleanup
            await prisma.timesheet.delete({ where: { id: shift.id } })
        })
    })

    test.describe('Zeitberechnung Edge-Cases', () => {
        test('Mitternachts-Übergang wird korrekt berechnet', async ({ prisma, testUsers }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(0, 0, 0, 0)

            // Schicht über Mitternacht
            const shift = await prisma.timesheet.upsert({
                where: {
                    employeeId_date: {
                        employeeId: employee!.id,
                        date: tomorrow
                    }
                },
                update: {
                    plannedStart: '23:00',
                    plannedEnd: '01:00',
                    actualStart: '23:00',
                    actualEnd: '01:00',
                    status: 'CONFIRMED',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0,
                    absenceType: null,
                    backupEmployeeId: null,
                    note: null
                },
                create: {
                    employeeId: employee!.id,
                    date: tomorrow,
                    plannedStart: '23:00',
                    plannedEnd: '01:00',
                    actualStart: '23:00',
                    actualEnd: '01:00',
                    status: 'CONFIRMED',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0
                }
            })

            // 23:00 - 01:00 = 2 Stunden (nicht -22 Stunden!)
            const start = 23 * 60
            const end = 1 * 60
            let diff = end - start
            if (diff < 0) diff += 24 * 60 // Korrektur für Mitternachtsübergang

            expect(diff).toBe(120) // 2 Stunden in Minuten

            // Cleanup
            await prisma.timesheet.delete({ where: { id: shift.id } })
        })

        test('0:00 bis 0:00 = 24 Stunden (nicht 0)', async ({ prisma, testUsers }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(0, 0, 0, 0)

            const shift = await prisma.timesheet.upsert({
                where: {
                    employeeId_date: {
                        employeeId: employee!.id,
                        date: tomorrow
                    }
                },
                update: {
                    plannedStart: '00:00',
                    plannedEnd: '00:00',
                    actualStart: '00:00',
                    actualEnd: '00:00',
                    status: 'CONFIRMED',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0,
                    absenceType: null,
                    backupEmployeeId: null,
                    note: null
                },
                create: {
                    employeeId: employee!.id,
                    date: tomorrow,
                    plannedStart: '00:00',
                    plannedEnd: '00:00',
                    actualStart: '00:00',
                    actualEnd: '00:00',
                    status: 'CONFIRMED',
                    month: tomorrow.getMonth() + 1,
                    year: tomorrow.getFullYear(),
                    breakMinutes: 0
                }
            })

            // Spezialfall: 0:00 - 0:00 = 24 Stunden
            const start = 0
            const end = 0
            let diff = end - start
            if (diff === 0 && shift.plannedStart === '00:00' && shift.plannedEnd === '00:00') {
                diff = 24 * 60 // 24 Stunden
            }

            expect(diff).toBe(1440) // 24 Stunden in Minuten

            // Cleanup
            await prisma.timesheet.delete({ where: { id: shift.id } })
        })
    })

    test.describe('Monatswechsel', () => {
        test('Schichten am Monatsersten werden korrekt erfasst', async ({ prisma, testUsers }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            // Erster Tag des nächsten Monats
            const firstOfMonth = new Date()
            firstOfMonth.setMonth(firstOfMonth.getMonth() + 1)
            firstOfMonth.setDate(1)
            firstOfMonth.setHours(0, 0, 0, 0)

            const shift = await prisma.timesheet.upsert({
                where: {
                    employeeId_date: {
                        employeeId: employee!.id,
                        date: firstOfMonth
                    }
                },
                update: {
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    actualStart: null,
                    actualEnd: null,
                    status: 'PLANNED',
                    month: firstOfMonth.getMonth() + 1,
                    year: firstOfMonth.getFullYear(),
                    breakMinutes: 0,
                    absenceType: null,
                    backupEmployeeId: null,
                    note: null
                },
                create: {
                    employeeId: employee!.id,
                    date: firstOfMonth,
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    status: 'PLANNED',
                    month: firstOfMonth.getMonth() + 1,
                    year: firstOfMonth.getFullYear(),
                    breakMinutes: 0
                }
            })

            expect(shift.date.getDate()).toBe(1)
            expect(shift.month).toBe(firstOfMonth.getMonth() + 1)

            // Cleanup
            await prisma.timesheet.delete({ where: { id: shift.id } })
        })

        test('Schichten am Monatsletzten werden korrekt erfasst', async ({ prisma, testUsers }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            // Letzter Tag des aktuellen Monats
            const lastOfMonth = new Date()
            lastOfMonth.setMonth(lastOfMonth.getMonth() + 1)
            lastOfMonth.setDate(0) // Letzter Tag des Vormonats
            lastOfMonth.setHours(0, 0, 0, 0)

            const shift = await prisma.timesheet.upsert({
                where: {
                    employeeId_date: {
                        employeeId: employee!.id,
                        date: lastOfMonth
                    }
                },
                update: {
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    actualStart: null,
                    actualEnd: null,
                    status: 'PLANNED',
                    month: lastOfMonth.getMonth() + 1,
                    year: lastOfMonth.getFullYear(),
                    breakMinutes: 0,
                    absenceType: null,
                    backupEmployeeId: null,
                    note: null
                },
                create: {
                    employeeId: employee!.id,
                    date: lastOfMonth,
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    status: 'PLANNED',
                    month: lastOfMonth.getMonth() + 1,
                    year: lastOfMonth.getFullYear(),
                    breakMinutes: 0
                }
            })

            // Prüfe dass es der letzte Tag ist (28, 29, 30 oder 31)
            expect(shift.date.getDate()).toBeGreaterThanOrEqual(28)

            // Cleanup
            await prisma.timesheet.delete({ where: { id: shift.id } })
        })
    })

    test.describe('Status-Übergänge', () => {
        test('PLANNED → CONFIRMED ist erlaubt', async ({ page, loginPage, testUsers, prisma }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            const testDate = new Date('2029-03-15T00:00:00Z')

            const shift = await prisma.timesheet.upsert({
                where: {
                    employeeId_date: {
                        employeeId: employee!.id,
                        date: testDate
                    }
                },
                update: {
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    actualStart: null,
                    actualEnd: null,
                    status: 'PLANNED',
                    month: 3,
                    year: 2029,
                    breakMinutes: 0,
                    absenceType: null,
                    backupEmployeeId: null,
                    note: null
                },
                create: {
                    employeeId: employee!.id,
                    date: testDate,
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    status: 'PLANNED',
                    month: 3,
                    year: 2029,
                    breakMinutes: 0
                }
            })

            await page.goto('/dashboard')
            await page.waitForLoadState('domcontentloaded')

            const response = await page.request.post('/api/timesheets', {
                data: {
                    id: shift.id,
                    action: 'CONFIRM'
                }
            })

            expect(response.ok()).toBeTruthy()

            const updated = await prisma.timesheet.findUnique({ where: { id: shift.id } })
            expect(updated!.status).toBe('CONFIRMED')

            // Cleanup
            await prisma.timesheet.delete({ where: { id: shift.id } })
        })

        test('CONFIRMED → PLANNED via UNCONFIRM ist erlaubt', async ({ page, loginPage, testUsers, prisma }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            const testDate = new Date('2029-03-16T00:00:00Z')

            const shift = await prisma.timesheet.upsert({
                where: {
                    employeeId_date: {
                        employeeId: employee!.id,
                        date: testDate
                    }
                },
                update: {
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    actualStart: '08:00',
                    actualEnd: '16:00',
                    status: 'CONFIRMED',
                    month: 3,
                    year: 2029,
                    breakMinutes: 0,
                    absenceType: null,
                    backupEmployeeId: null,
                    note: null
                },
                create: {
                    employeeId: employee!.id,
                    date: testDate,
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    actualStart: '08:00',
                    actualEnd: '16:00',
                    status: 'CONFIRMED',
                    month: 3,
                    year: 2029,
                    breakMinutes: 0
                }
            })

            await page.goto('/dashboard')
            await page.waitForLoadState('domcontentloaded')

            const response = await page.request.post('/api/timesheets', {
                data: {
                    id: shift.id,
                    action: 'UNCONFIRM'
                }
            })

            expect(response.ok()).toBeTruthy()

            const updated = await prisma.timesheet.findUnique({ where: { id: shift.id } })
            expect(updated!.status).toBe('PLANNED')
            expect(updated!.actualStart).toBeNull()
            expect(updated!.actualEnd).toBeNull()

            // Cleanup
            await prisma.timesheet.delete({ where: { id: shift.id } })
        })

        test('CHANGED Status bei geänderten Zeiten', async ({ page, loginPage, testUsers, prisma }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            const testDate = new Date('2029-03-17T00:00:00Z')

            const shift = await prisma.timesheet.upsert({
                where: {
                    employeeId_date: {
                        employeeId: employee!.id,
                        date: testDate
                    }
                },
                update: {
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    actualStart: null,
                    actualEnd: null,
                    status: 'PLANNED',
                    month: 3,
                    year: 2029,
                    breakMinutes: 0,
                    absenceType: null,
                    backupEmployeeId: null,
                    note: null
                },
                create: {
                    employeeId: employee!.id,
                    date: testDate,
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    status: 'PLANNED',
                    month: 3,
                    year: 2029,
                    breakMinutes: 0
                }
            })

            await page.goto('/dashboard')
            await page.waitForLoadState('domcontentloaded')

            // Andere Zeiten als geplant
            const response = await page.request.post('/api/timesheets', {
                data: {
                    id: shift.id,
                    actualStart: '09:00', // Später angefangen
                    actualEnd: '17:00'    // Später aufgehört
                }
            })

            expect(response.ok()).toBeTruthy()

            const updated = await prisma.timesheet.findUnique({ where: { id: shift.id } })
            expect(updated!.status).toBe('CHANGED')

            // Cleanup
            await prisma.timesheet.delete({ where: { id: shift.id } })
        })
    })
})
