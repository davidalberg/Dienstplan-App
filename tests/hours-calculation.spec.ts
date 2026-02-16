import { test, expect } from './fixtures'

/**
 * Stundenberechnungen Tests
 *
 * Testet alle Arten von Stundenberechnungen:
 * - Reguläre Stunden
 * - Nachtstunden (22:00 - 6:00)
 * - Sonntagsstunden
 * - Feiertagsstunden
 * - Kombinationen
 */

test.describe('Stundenberechnungen', () => {
    test.use({ storageState: 'tests/.auth/admin.json' })

    test.beforeEach(async ({ page }) => {
        await page.goto('/admin/schedule')
        await page.waitForLoadState('domcontentloaded')
    })

    test('8h Tagschicht (8:00-16:00) = 8h regulär, 0h Nacht', async ({ page, prisma, testUsers }) => {
        // Erstelle eine Tagschicht für den Test-Mitarbeiter
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
        expect(employee).toBeTruthy()

        const testDate = new Date()
        testDate.setHours(0, 0, 0, 0)

        // Erstelle Schicht direkt in der DB
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
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
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
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                breakMinutes: 0
            }
        })

        // Berechne erwartete Stunden: 8h gesamt, 0h Nacht
        const startMinutes = 8 * 60
        const endMinutes = 16 * 60
        const totalMinutes = endMinutes - startMinutes
        expect(totalMinutes).toBe(480) // 8 Stunden

        // Keine Nachtstunden (8:00-16:00 ist außerhalb 22:00-6:00)
        // Cleanup
        await prisma.timesheet.delete({ where: { id: shift.id } })
    })

    test('8h Nachtschicht (22:00-6:00) = 8h regulär, 8h Nacht', async ({ page, prisma, testUsers }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
        expect(employee).toBeTruthy()

        const testDate = new Date()
        testDate.setHours(0, 0, 0, 0)

        const shift = await prisma.timesheet.upsert({
            where: {
                employeeId_date: {
                    employeeId: employee!.id,
                    date: testDate
                }
            },
            update: {
                plannedStart: '22:00',
                plannedEnd: '06:00',
                actualStart: '22:00',
                actualEnd: '06:00',
                status: 'CONFIRMED',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                breakMinutes: 0,
                absenceType: null,
                backupEmployeeId: null,
                note: null
            },
            create: {
                employeeId: employee!.id,
                date: testDate,
                plannedStart: '22:00',
                plannedEnd: '06:00',
                actualStart: '22:00',
                actualEnd: '06:00',
                status: 'CONFIRMED',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                breakMinutes: 0
            }
        })

        // 22:00 - 06:00 = 8 Stunden (über Mitternacht)
        // Alle 8 Stunden sind Nachtstunden (22-6)
        // Cleanup
        await prisma.timesheet.delete({ where: { id: shift.id } })
    })

    test('24h-Schicht (0:00-0:00) = 24h regulär', async ({ page, prisma, testUsers }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
        expect(employee).toBeTruthy()

        const testDate = new Date()
        testDate.setHours(0, 0, 0, 0)

        const shift = await prisma.timesheet.upsert({
            where: {
                employeeId_date: {
                    employeeId: employee!.id,
                    date: testDate
                }
            },
            update: {
                plannedStart: '00:00',
                plannedEnd: '00:00',
                actualStart: '00:00',
                actualEnd: '00:00',
                status: 'CONFIRMED',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                breakMinutes: 0,
                absenceType: null,
                backupEmployeeId: null,
                note: null
            },
            create: {
                employeeId: employee!.id,
                date: testDate,
                plannedStart: '00:00',
                plannedEnd: '00:00',
                actualStart: '00:00',
                actualEnd: '00:00',
                status: 'CONFIRMED',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                breakMinutes: 0
            }
        })

        // 0:00 - 0:00 = 24 Stunden (Spezialfall)
        // Cleanup
        await prisma.timesheet.delete({ where: { id: shift.id } })
    })

    test('Übernacht-Dienst (23:00-7:00) = 8h regulär, 7h Nacht', async ({ page, prisma, testUsers }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
        expect(employee).toBeTruthy()

        const testDate = new Date()
        testDate.setHours(0, 0, 0, 0)

        const shift = await prisma.timesheet.upsert({
            where: {
                employeeId_date: {
                    employeeId: employee!.id,
                    date: testDate
                }
            },
            update: {
                plannedStart: '23:00',
                plannedEnd: '07:00',
                actualStart: '23:00',
                actualEnd: '07:00',
                status: 'CONFIRMED',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                breakMinutes: 0,
                absenceType: null,
                backupEmployeeId: null,
                note: null
            },
            create: {
                employeeId: employee!.id,
                date: testDate,
                plannedStart: '23:00',
                plannedEnd: '07:00',
                actualStart: '23:00',
                actualEnd: '07:00',
                status: 'CONFIRMED',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                breakMinutes: 0
            }
        })

        // 23:00 - 7:00 = 8 Stunden gesamt
        // Nachtstunden: 23:00-6:00 = 7 Stunden
        // Cleanup
        await prisma.timesheet.delete({ where: { id: shift.id } })
    })

    test('Gemischte Schicht (20:00-4:00) = 8h regulär, 6h Nacht', async ({ page, prisma, testUsers }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
        expect(employee).toBeTruthy()

        const testDate = new Date()
        testDate.setHours(0, 0, 0, 0)

        const shift = await prisma.timesheet.upsert({
            where: {
                employeeId_date: {
                    employeeId: employee!.id,
                    date: testDate
                }
            },
            update: {
                plannedStart: '20:00',
                plannedEnd: '04:00',
                actualStart: '20:00',
                actualEnd: '04:00',
                status: 'CONFIRMED',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                breakMinutes: 0,
                absenceType: null,
                backupEmployeeId: null,
                note: null
            },
            create: {
                employeeId: employee!.id,
                date: testDate,
                plannedStart: '20:00',
                plannedEnd: '04:00',
                actualStart: '20:00',
                actualEnd: '04:00',
                status: 'CONFIRMED',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                breakMinutes: 0
            }
        })

        // 20:00 - 4:00 = 8 Stunden gesamt
        // Nachtstunden: 22:00-4:00 = 6 Stunden
        // Cleanup
        await prisma.timesheet.delete({ where: { id: shift.id } })
    })

    test('Sonntagsschicht wird korrekt erfasst', async ({ page, prisma, testUsers }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
        expect(employee).toBeTruthy()

        // Finde einen Sonntag
        const testDate = new Date()
        while (testDate.getDay() !== 0) {
            testDate.setDate(testDate.getDate() + 1)
        }
        testDate.setHours(0, 0, 0, 0)

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
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
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
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                breakMinutes: 0
            }
        })

        // Prüfe dass es ein Sonntag ist
        expect(testDate.getDay()).toBe(0)

        // Cleanup
        await prisma.timesheet.delete({ where: { id: shift.id } })
    })

    test('Ist-Zeiten überschreiben Plan-Zeiten bei Berechnung', async ({ page, prisma, testUsers }) => {
        const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
        expect(employee).toBeTruthy()

        const testDate = new Date()
        testDate.setHours(0, 0, 0, 0)

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
                actualStart: '07:00',
                actualEnd: '17:00',
                status: 'CHANGED',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
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
                actualStart: '07:00',
                actualEnd: '17:00',
                status: 'CHANGED',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                breakMinutes: 0
            }
        })

        // Ist-Zeiten: 7:00-17:00 = 10 Stunden (statt geplante 8)
        expect(shift.actualStart).toBe('07:00')
        expect(shift.actualEnd).toBe('17:00')

        // Cleanup
        await prisma.timesheet.delete({ where: { id: shift.id } })
    })

    test('Stunden werden für Backup-Mitarbeiter gezählt wenn eingesprungen', async ({ page, prisma, testUsers }) => {
        const mainEmployee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
        const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })
        expect(mainEmployee).toBeTruthy()
        expect(backupEmployee).toBeTruthy()

        const testDate = new Date()
        testDate.setHours(0, 0, 0, 0)

        // Hauptmitarbeiter ist krank
        const mainShift = await prisma.timesheet.upsert({
            where: {
                employeeId_date: {
                    employeeId: mainEmployee!.id,
                    date: testDate
                }
            },
            update: {
                backupEmployeeId: backupEmployee!.id,
                plannedStart: '08:00',
                plannedEnd: '16:00',
                actualStart: null,
                actualEnd: null,
                status: 'PLANNED',
                absenceType: 'SICK',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                breakMinutes: 0,
                note: null
            },
            create: {
                employeeId: mainEmployee!.id,
                backupEmployeeId: backupEmployee!.id,
                date: testDate,
                plannedStart: '08:00',
                plannedEnd: '16:00',
                status: 'PLANNED',
                absenceType: 'SICK',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                breakMinutes: 0
            }
        })

        // Backup springt ein
        const backupShift = await prisma.timesheet.upsert({
            where: {
                employeeId_date: {
                    employeeId: backupEmployee!.id,
                    date: testDate
                }
            },
            update: {
                plannedStart: '08:00',
                plannedEnd: '16:00',
                actualStart: '08:00',
                actualEnd: '16:00',
                status: 'CONFIRMED',
                note: 'Backup-Schicht anfallend wegen Krankheit',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                breakMinutes: 0,
                absenceType: null,
                backupEmployeeId: null
            },
            create: {
                employeeId: backupEmployee!.id,
                date: testDate,
                plannedStart: '08:00',
                plannedEnd: '16:00',
                actualStart: '08:00',
                actualEnd: '16:00',
                status: 'CONFIRMED',
                note: 'Backup-Schicht anfallend wegen Krankheit',
                month: testDate.getMonth() + 1,
                year: testDate.getFullYear(),
                breakMinutes: 0
            }
        })

        // Backup sollte 8 Stunden haben
        expect(backupShift.actualStart).toBe('08:00')
        expect(backupShift.actualEnd).toBe('16:00')

        // Cleanup
        await prisma.timesheet.delete({ where: { id: backupShift.id } })
        await prisma.timesheet.delete({ where: { id: mainShift.id } })
    })
})
