import { test, expect } from './fixtures'
import * as XLSX from 'xlsx'

/**
 * Business-Correctness E2E-Tests
 *
 * Diese Tests verifizieren die KORREKTHEIT der Business-Logik:
 * - Excel-Export (Lohnliste) Spalten
 * - Nachtstunden-Berechnung (23:00-06:00)
 * - Sonntagsstunden-Berechnung
 * - NRW-Feiertagsstunden (11 Feiertage)
 * - Krankheits-/Urlaubstage-Zählung
 * - Backup-Tage (Bereitschaftstage)
 */

// Helper: Parse Excel response
async function parseExcelResponse(response: any): Promise<any[]> {
    const buffer = await response.body()
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    return XLSX.utils.sheet_to_json(sheet)
}

// Helper: Create date safely (timezone-safe)
function createLocalDate(year: number, month: number, day: number): Date {
    const d = new Date(year, month - 1, day)
    d.setHours(12, 0, 0, 0) // Noon to avoid timezone issues
    return d
}

// Test cleanup marker
const TEST_NOTE_PREFIX = 'E2E_BUSINESS_TEST'

test.describe('Business-Correctness Tests', () => {
    // Use admin auth for API access
    test.use({ storageState: 'tests/.auth/admin.json' })

    // Cleanup after each test
    test.afterEach(async ({ prisma }) => {
        await prisma.timesheet.deleteMany({
            where: { note: { contains: TEST_NOTE_PREFIX } }
        })
    })

    // ============================================================
    // SUITE 1: Excel Export Verification (7 Tests)
    // Use unique year 2028 to avoid conflicts with other tests
    // ============================================================
    test.describe('Suite 1: Excel Export Verification', () => {
        const EXPORT_TEST_YEAR = 2028
        const EXPORT_TEST_MONTH = 1

        // Clean up before each test to ensure isolation
        test.beforeEach(async ({ prisma, testUsers }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
            if (employee) {
                await prisma.timesheet.deleteMany({
                    where: {
                        employeeId: employee.id,
                        month: EXPORT_TEST_MONTH,
                        year: EXPORT_TEST_YEAR
                    }
                })
            }
        })

        test('Stunden Gesamt: 3 Schichten à 8h = 24h im Export', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            // Create 3 shifts of 8h each on different weekdays (no holidays, no Sundays)
            // Jan 2028: 4=Tue, 5=Wed, 6=Thu
            const shifts = await Promise.all([
                prisma.timesheet.create({
                    data: {
                        employeeId: employee!.id,
                        date: createLocalDate(EXPORT_TEST_YEAR, EXPORT_TEST_MONTH, 4), // Tuesday
                        plannedStart: '08:00', plannedEnd: '16:00',
                        actualStart: '08:00', actualEnd: '16:00',
                        status: 'CONFIRMED', month: EXPORT_TEST_MONTH, year: EXPORT_TEST_YEAR, breakMinutes: 0,
                        note: `${TEST_NOTE_PREFIX}_TOTAL_1`
                    }
                }),
                prisma.timesheet.create({
                    data: {
                        employeeId: employee!.id,
                        date: createLocalDate(EXPORT_TEST_YEAR, EXPORT_TEST_MONTH, 5), // Wednesday
                        plannedStart: '08:00', plannedEnd: '16:00',
                        actualStart: '08:00', actualEnd: '16:00',
                        status: 'CONFIRMED', month: EXPORT_TEST_MONTH, year: EXPORT_TEST_YEAR, breakMinutes: 0,
                        note: `${TEST_NOTE_PREFIX}_TOTAL_2`
                    }
                }),
                prisma.timesheet.create({
                    data: {
                        employeeId: employee!.id,
                        date: createLocalDate(EXPORT_TEST_YEAR, EXPORT_TEST_MONTH, 6), // Thursday
                        plannedStart: '08:00', plannedEnd: '16:00',
                        actualStart: '08:00', actualEnd: '16:00',
                        status: 'CONFIRMED', month: EXPORT_TEST_MONTH, year: EXPORT_TEST_YEAR, breakMinutes: 0,
                        note: `${TEST_NOTE_PREFIX}_TOTAL_3`
                    }
                })
            ])

            // Export Excel
            const response = await page.request.get(
                `/api/timesheets/export?month=${EXPORT_TEST_MONTH}&year=${EXPORT_TEST_YEAR}&employeeId=${employee!.id}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            expect(rows.length).toBeGreaterThan(0)
            expect(rows[0]['G_Stunden_Gesamt']).toBe(24) // 3 x 8h = 24h
        })

        test('Nachtstunden: Schicht 22:00-06:00 = 7 Nachtstunden im Export', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            // Night shift: 22:00-06:00 = 8h total, 7h night (23:00-06:00)
            // Jan 2028: 6=Thu (no holiday, no Sunday)
            await prisma.timesheet.create({
                data: {
                    employeeId: employee!.id,
                    date: createLocalDate(EXPORT_TEST_YEAR, EXPORT_TEST_MONTH, 6), // Thursday
                    plannedStart: '22:00', plannedEnd: '06:00',
                    actualStart: '22:00', actualEnd: '06:00',
                    status: 'CONFIRMED', month: EXPORT_TEST_MONTH, year: EXPORT_TEST_YEAR, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_NIGHT`
                }
            })

            const response = await page.request.get(
                `/api/timesheets/export?month=${EXPORT_TEST_MONTH}&year=${EXPORT_TEST_YEAR}&employeeId=${employee!.id}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            expect(rows[0]['G_Stunden_Gesamt']).toBe(8)
            expect(rows[0]['H_Nachtstunden']).toBe(7) // 23:00-06:00 = 7h
        })

        test('Sonntagsstunden: Schicht am Sonntag = 8 Sonntagsstunden im Export', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            // Sunday shift: Jan 2028: 2, 9, 16, 23, 30 are Sundays
            await prisma.timesheet.create({
                data: {
                    employeeId: employee!.id,
                    date: createLocalDate(EXPORT_TEST_YEAR, EXPORT_TEST_MONTH, 9), // Sunday
                    plannedStart: '08:00', plannedEnd: '16:00',
                    actualStart: '08:00', actualEnd: '16:00',
                    status: 'CONFIRMED', month: EXPORT_TEST_MONTH, year: EXPORT_TEST_YEAR, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_SUNDAY`
                }
            })

            const response = await page.request.get(
                `/api/timesheets/export?month=${EXPORT_TEST_MONTH}&year=${EXPORT_TEST_YEAR}&employeeId=${employee!.id}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            expect(rows[0]['G_Stunden_Gesamt']).toBe(8)
            expect(rows[0]['I_Sonntagsstunden']).toBe(8)
        })

        test('Feiertagsstunden: Schicht am 01.01.2028 (Neujahr) = 8 Feiertagsstunden', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            // Holiday shift: 2028-01-01 is Neujahr (Saturday)
            await prisma.timesheet.create({
                data: {
                    employeeId: employee!.id,
                    date: createLocalDate(EXPORT_TEST_YEAR, EXPORT_TEST_MONTH, 1), // Neujahr
                    plannedStart: '08:00', plannedEnd: '16:00',
                    actualStart: '08:00', actualEnd: '16:00',
                    status: 'CONFIRMED', month: EXPORT_TEST_MONTH, year: EXPORT_TEST_YEAR, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_HOLIDAY`
                }
            })

            const response = await page.request.get(
                `/api/timesheets/export?month=${EXPORT_TEST_MONTH}&year=${EXPORT_TEST_YEAR}&employeeId=${employee!.id}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            expect(rows[0]['G_Stunden_Gesamt']).toBe(8)
            expect(rows[0]['J_Feiertagsstunden']).toBe(8)
        })

        test('Krankheitstage: 3 Schichten SICK = 3 Krankheitstage im Export', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            // 3 sick days - Jan 2028: 10=Mon, 11=Tue, 12=Wed
            await Promise.all([
                prisma.timesheet.create({
                    data: {
                        employeeId: employee!.id,
                        date: createLocalDate(EXPORT_TEST_YEAR, EXPORT_TEST_MONTH, 10),
                        plannedStart: '08:00', plannedEnd: '16:00',
                        status: 'PLANNED', absenceType: 'SICK',
                        month: EXPORT_TEST_MONTH, year: EXPORT_TEST_YEAR, breakMinutes: 0,
                        note: `${TEST_NOTE_PREFIX}_SICK_1`
                    }
                }),
                prisma.timesheet.create({
                    data: {
                        employeeId: employee!.id,
                        date: createLocalDate(EXPORT_TEST_YEAR, EXPORT_TEST_MONTH, 11),
                        plannedStart: '08:00', plannedEnd: '16:00',
                        status: 'PLANNED', absenceType: 'SICK',
                        month: EXPORT_TEST_MONTH, year: EXPORT_TEST_YEAR, breakMinutes: 0,
                        note: `${TEST_NOTE_PREFIX}_SICK_2`
                    }
                }),
                prisma.timesheet.create({
                    data: {
                        employeeId: employee!.id,
                        date: createLocalDate(EXPORT_TEST_YEAR, EXPORT_TEST_MONTH, 12),
                        plannedStart: '08:00', plannedEnd: '16:00',
                        status: 'PLANNED', absenceType: 'SICK',
                        month: EXPORT_TEST_MONTH, year: EXPORT_TEST_YEAR, breakMinutes: 0,
                        note: `${TEST_NOTE_PREFIX}_SICK_3`
                    }
                })
            ])

            const response = await page.request.get(
                `/api/timesheets/export?month=${EXPORT_TEST_MONTH}&year=${EXPORT_TEST_YEAR}&employeeId=${employee!.id}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            expect(rows[0]['L_Krankheitstage']).toBe(3)
        })

        test('Urlaubstage: 2 Schichten VACATION = 2 Urlaubstage im Export', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            // 2 vacation days - Jan 2028: 17=Mon, 18=Tue
            await Promise.all([
                prisma.timesheet.create({
                    data: {
                        employeeId: employee!.id,
                        date: createLocalDate(EXPORT_TEST_YEAR, EXPORT_TEST_MONTH, 17),
                        plannedStart: '08:00', plannedEnd: '16:00',
                        status: 'PLANNED', absenceType: 'VACATION',
                        month: EXPORT_TEST_MONTH, year: EXPORT_TEST_YEAR, breakMinutes: 0,
                        note: `${TEST_NOTE_PREFIX}_VAC_1`
                    }
                }),
                prisma.timesheet.create({
                    data: {
                        employeeId: employee!.id,
                        date: createLocalDate(EXPORT_TEST_YEAR, EXPORT_TEST_MONTH, 18),
                        plannedStart: '08:00', plannedEnd: '16:00',
                        status: 'PLANNED', absenceType: 'VACATION',
                        month: EXPORT_TEST_MONTH, year: EXPORT_TEST_YEAR, breakMinutes: 0,
                        note: `${TEST_NOTE_PREFIX}_VAC_2`
                    }
                })
            ])

            const response = await page.request.get(
                `/api/timesheets/export?month=${EXPORT_TEST_MONTH}&year=${EXPORT_TEST_YEAR}&employeeId=${employee!.id}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            expect(rows[0]['N_Urlaubstage']).toBe(2)
        })

        test('Bereitschaftstage: Backup eingesprungen = 1 Bereitschaftstag im Export', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
            const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })

            // Main person is sick, backup jumps in - Jan 2028: 19=Wed
            const testDate = createLocalDate(EXPORT_TEST_YEAR, EXPORT_TEST_MONTH, 19)

            // Main shift (sick) with backup assigned
            await prisma.timesheet.create({
                data: {
                    employeeId: employee!.id,
                    backupEmployeeId: backupEmployee!.id,
                    date: testDate,
                    plannedStart: '08:00', plannedEnd: '16:00',
                    status: 'PLANNED', absenceType: 'SICK',
                    month: EXPORT_TEST_MONTH, year: EXPORT_TEST_YEAR, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_MAIN_SICK`
                }
            })

            // Backup shift (jumped in)
            await prisma.timesheet.create({
                data: {
                    employeeId: backupEmployee!.id,
                    date: testDate,
                    plannedStart: '08:00', plannedEnd: '16:00',
                    actualStart: '08:00', actualEnd: '16:00',
                    status: 'CONFIRMED',
                    month: EXPORT_TEST_MONTH, year: EXPORT_TEST_YEAR, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_BACKUP Eingesprungen für Krankheit`
                }
            })

            // Export ALL employees (needed for backup calculation to see all timesheets)
            const response = await page.request.get(
                `/api/timesheets/export?month=${EXPORT_TEST_MONTH}&year=${EXPORT_TEST_YEAR}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            // Find backup employee row
            const backupRow = rows.find((r: any) => r['C_Name'] === backupEmployee!.name)
            expect(backupRow).toBeTruthy()
            expect(backupRow['K_Bereitschaftstage']).toBeGreaterThanOrEqual(1)
        })
    })

    // ============================================================
    // SUITE 2: Nachtstunden-Berechnung (6 Tests)
    // ============================================================
    test.describe('Suite 2: Nachtstunden-Berechnung (23:00-06:00)', () => {

        test('22:00-06:00 = 8h total, 7h Nacht', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            await prisma.timesheet.create({
                data: {
                    employeeId: employee!.id,
                    date: createLocalDate(2026, 2, 10), // Tuesday, Feb
                    plannedStart: '22:00', plannedEnd: '06:00',
                    actualStart: '22:00', actualEnd: '06:00',
                    status: 'CONFIRMED', month: 2, year: 2026, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_NIGHT_22_06`
                }
            })

            const response = await page.request.get(
                `/api/timesheets/export?month=2&year=2026&employeeId=${employee!.id}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            expect(rows[0]['G_Stunden_Gesamt']).toBe(8)
            expect(rows[0]['H_Nachtstunden']).toBe(7) // 23:00-06:00
        })

        test('18:00-02:00 = 8h total, 3h Nacht', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            await prisma.timesheet.create({
                data: {
                    employeeId: employee!.id,
                    date: createLocalDate(2026, 2, 11),
                    plannedStart: '18:00', plannedEnd: '02:00',
                    actualStart: '18:00', actualEnd: '02:00',
                    status: 'CONFIRMED', month: 2, year: 2026, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_NIGHT_18_02`
                }
            })

            const response = await page.request.get(
                `/api/timesheets/export?month=2&year=2026&employeeId=${employee!.id}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            expect(rows[0]['G_Stunden_Gesamt']).toBe(8)
            expect(rows[0]['H_Nachtstunden']).toBe(3) // 23:00-02:00
        })

        test('23:00-07:00 = 8h total, 7h Nacht', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            await prisma.timesheet.create({
                data: {
                    employeeId: employee!.id,
                    date: createLocalDate(2026, 2, 12),
                    plannedStart: '23:00', plannedEnd: '07:00',
                    actualStart: '23:00', actualEnd: '07:00',
                    status: 'CONFIRMED', month: 2, year: 2026, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_NIGHT_23_07`
                }
            })

            const response = await page.request.get(
                `/api/timesheets/export?month=2&year=2026&employeeId=${employee!.id}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            expect(rows[0]['G_Stunden_Gesamt']).toBe(8)
            expect(rows[0]['H_Nachtstunden']).toBe(7) // 23:00-06:00
        })

        test('00:00-00:00 (24h) = 24h total, 7h Nacht', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            await prisma.timesheet.create({
                data: {
                    employeeId: employee!.id,
                    date: createLocalDate(2026, 2, 13),
                    plannedStart: '00:00', plannedEnd: '00:00',
                    actualStart: '00:00', actualEnd: '00:00',
                    status: 'CONFIRMED', month: 2, year: 2026, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_NIGHT_24H`
                }
            })

            const response = await page.request.get(
                `/api/timesheets/export?month=2&year=2026&employeeId=${employee!.id}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            expect(rows[0]['G_Stunden_Gesamt']).toBe(24)
            expect(rows[0]['H_Nachtstunden']).toBe(7) // 00:00-06:00 + 23:00-24:00
        })

        test('06:00-14:00 (Tagschicht) = 8h total, 0h Nacht', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            await prisma.timesheet.create({
                data: {
                    employeeId: employee!.id,
                    date: createLocalDate(2026, 2, 14),
                    plannedStart: '06:00', plannedEnd: '14:00',
                    actualStart: '06:00', actualEnd: '14:00',
                    status: 'CONFIRMED', month: 2, year: 2026, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_DAY`
                }
            })

            const response = await page.request.get(
                `/api/timesheets/export?month=2&year=2026&employeeId=${employee!.id}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            expect(rows[0]['G_Stunden_Gesamt']).toBe(8)
            expect(rows[0]['H_Nachtstunden']).toBe(0)
        })

        test('20:00-04:00 = 8h total, 5h Nacht', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            await prisma.timesheet.create({
                data: {
                    employeeId: employee!.id,
                    date: createLocalDate(2026, 2, 15),
                    plannedStart: '20:00', plannedEnd: '04:00',
                    actualStart: '20:00', actualEnd: '04:00',
                    status: 'CONFIRMED', month: 2, year: 2026, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_NIGHT_20_04`
                }
            })

            const response = await page.request.get(
                `/api/timesheets/export?month=2&year=2026&employeeId=${employee!.id}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            expect(rows[0]['G_Stunden_Gesamt']).toBe(8)
            expect(rows[0]['H_Nachtstunden']).toBe(5) // 23:00-04:00
        })
    })

    // ============================================================
    // SUITE 3: NRW-Feiertage Verification (11 Tests)
    // ============================================================
    test.describe('Suite 3: NRW-Feiertage (11 Feiertage 2026)', () => {

        const nrwHolidays2026 = [
            { date: '2026-01-01', name: 'Neujahr', month: 1 },
            { date: '2026-04-03', name: 'Karfreitag', month: 4 },
            { date: '2026-04-06', name: 'Ostermontag', month: 4 },
            { date: '2026-05-01', name: 'Tag der Arbeit', month: 5 },
            { date: '2026-05-14', name: 'Christi Himmelfahrt', month: 5 },
            { date: '2026-05-25', name: 'Pfingstmontag', month: 5 },
            { date: '2026-06-04', name: 'Fronleichnam', month: 6 },
            { date: '2026-10-03', name: 'Tag der Deutschen Einheit', month: 10 },
            { date: '2026-11-01', name: 'Allerheiligen (SONNTAG!)', month: 11 },
            { date: '2026-12-25', name: '1. Weihnachtsfeiertag', month: 12 },
            { date: '2026-12-26', name: '2. Weihnachtsfeiertag', month: 12 },
        ]

        for (const holiday of nrwHolidays2026) {
            test(`${holiday.name} (${holiday.date}) wird als Feiertag erkannt`, async ({ prisma, testUsers, page }) => {
                const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

                const [year, month, day] = holiday.date.split('-').map(Number)

                await prisma.timesheet.create({
                    data: {
                        employeeId: employee!.id,
                        date: createLocalDate(year, month, day),
                        plannedStart: '08:00', plannedEnd: '16:00',
                        actualStart: '08:00', actualEnd: '16:00',
                        status: 'CONFIRMED',
                        month: holiday.month, year: 2026, breakMinutes: 0,
                        note: `${TEST_NOTE_PREFIX}_HOLIDAY_${holiday.date}`
                    }
                })

                const response = await page.request.get(
                    `/api/timesheets/export?month=${holiday.month}&year=2026&employeeId=${employee!.id}`
                )
                expect(response.ok()).toBeTruthy()

                const rows = await parseExcelResponse(response)
                expect(rows[0]['J_Feiertagsstunden']).toBe(8)

                // Special case: Allerheiligen 2026 is a Sunday - should also have Sunday hours
                if (holiday.date === '2026-11-01') {
                    expect(rows[0]['I_Sonntagsstunden']).toBe(8)
                }
            })
        }
    })

    // ============================================================
    // SUITE 4: Krankheit/Urlaub Zählung (5 Tests)
    // ============================================================
    test.describe('Suite 4: Krankheit/Urlaub Zählung', () => {

        test('1 Schicht SICK = sickDays=1, sickHours=8', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            await prisma.timesheet.create({
                data: {
                    employeeId: employee!.id,
                    date: createLocalDate(2026, 3, 10),
                    plannedStart: '08:00', plannedEnd: '16:00',
                    status: 'PLANNED', absenceType: 'SICK',
                    month: 3, year: 2026, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_SICK_SINGLE`
                }
            })

            const response = await page.request.get(
                `/api/timesheets/export?month=3&year=2026&employeeId=${employee!.id}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            expect(rows[0]['L_Krankheitstage']).toBe(1)
            expect(rows[0]['M_Krankstunden']).toBe(8)
        })

        test('3 Schichten SICK (verschiedene Tage) = sickDays=3', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            await Promise.all([
                prisma.timesheet.create({
                    data: {
                        employeeId: employee!.id,
                        date: createLocalDate(2026, 3, 11),
                        plannedStart: '08:00', plannedEnd: '16:00',
                        status: 'PLANNED', absenceType: 'SICK',
                        month: 3, year: 2026, breakMinutes: 0,
                        note: `${TEST_NOTE_PREFIX}_SICK_MULTI_1`
                    }
                }),
                prisma.timesheet.create({
                    data: {
                        employeeId: employee!.id,
                        date: createLocalDate(2026, 3, 12),
                        plannedStart: '08:00', plannedEnd: '16:00',
                        status: 'PLANNED', absenceType: 'SICK',
                        month: 3, year: 2026, breakMinutes: 0,
                        note: `${TEST_NOTE_PREFIX}_SICK_MULTI_2`
                    }
                }),
                prisma.timesheet.create({
                    data: {
                        employeeId: employee!.id,
                        date: createLocalDate(2026, 3, 13),
                        plannedStart: '08:00', plannedEnd: '16:00',
                        status: 'PLANNED', absenceType: 'SICK',
                        month: 3, year: 2026, breakMinutes: 0,
                        note: `${TEST_NOTE_PREFIX}_SICK_MULTI_3`
                    }
                })
            ])

            const response = await page.request.get(
                `/api/timesheets/export?month=3&year=2026&employeeId=${employee!.id}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            expect(rows[0]['L_Krankheitstage']).toBe(3)
        })

        test('2 Schichten VACATION = vacationDays=2', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            await Promise.all([
                prisma.timesheet.create({
                    data: {
                        employeeId: employee!.id,
                        date: createLocalDate(2026, 3, 16),
                        plannedStart: '08:00', plannedEnd: '16:00',
                        status: 'PLANNED', absenceType: 'VACATION',
                        month: 3, year: 2026, breakMinutes: 0,
                        note: `${TEST_NOTE_PREFIX}_VAC_MULTI_1`
                    }
                }),
                prisma.timesheet.create({
                    data: {
                        employeeId: employee!.id,
                        date: createLocalDate(2026, 3, 17),
                        plannedStart: '08:00', plannedEnd: '16:00',
                        status: 'PLANNED', absenceType: 'VACATION',
                        month: 3, year: 2026, breakMinutes: 0,
                        note: `${TEST_NOTE_PREFIX}_VAC_MULTI_2`
                    }
                })
            ])

            const response = await page.request.get(
                `/api/timesheets/export?month=3&year=2026&employeeId=${employee!.id}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            expect(rows[0]['N_Urlaubstage']).toBe(2)
        })

        test('Gemischt: 2 SICK, 2 VACATION, 1 normal = korrekte Zählung', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            await Promise.all([
                // 2 sick
                prisma.timesheet.create({
                    data: {
                        employeeId: employee!.id,
                        date: createLocalDate(2026, 3, 20),
                        plannedStart: '08:00', plannedEnd: '16:00',
                        status: 'PLANNED', absenceType: 'SICK',
                        month: 3, year: 2026, breakMinutes: 0,
                        note: `${TEST_NOTE_PREFIX}_MIX_SICK_1`
                    }
                }),
                prisma.timesheet.create({
                    data: {
                        employeeId: employee!.id,
                        date: createLocalDate(2026, 3, 21),
                        plannedStart: '08:00', plannedEnd: '16:00',
                        status: 'PLANNED', absenceType: 'SICK',
                        month: 3, year: 2026, breakMinutes: 0,
                        note: `${TEST_NOTE_PREFIX}_MIX_SICK_2`
                    }
                }),
                // 2 vacation
                prisma.timesheet.create({
                    data: {
                        employeeId: employee!.id,
                        date: createLocalDate(2026, 3, 23),
                        plannedStart: '08:00', plannedEnd: '16:00',
                        status: 'PLANNED', absenceType: 'VACATION',
                        month: 3, year: 2026, breakMinutes: 0,
                        note: `${TEST_NOTE_PREFIX}_MIX_VAC_1`
                    }
                }),
                prisma.timesheet.create({
                    data: {
                        employeeId: employee!.id,
                        date: createLocalDate(2026, 3, 24),
                        plannedStart: '08:00', plannedEnd: '16:00',
                        status: 'PLANNED', absenceType: 'VACATION',
                        month: 3, year: 2026, breakMinutes: 0,
                        note: `${TEST_NOTE_PREFIX}_MIX_VAC_2`
                    }
                }),
                // 1 normal worked
                prisma.timesheet.create({
                    data: {
                        employeeId: employee!.id,
                        date: createLocalDate(2026, 3, 25),
                        plannedStart: '08:00', plannedEnd: '16:00',
                        actualStart: '08:00', actualEnd: '16:00',
                        status: 'CONFIRMED',
                        month: 3, year: 2026, breakMinutes: 0,
                        note: `${TEST_NOTE_PREFIX}_MIX_NORMAL`
                    }
                })
            ])

            const response = await page.request.get(
                `/api/timesheets/export?month=3&year=2026&employeeId=${employee!.id}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            expect(rows[0]['L_Krankheitstage']).toBe(2)
            expect(rows[0]['N_Urlaubstage']).toBe(2)
            expect(rows[0]['G_Stunden_Gesamt']).toBe(8) // Only worked shift
        })

        test('Nachtschicht SICK = sickHours zählt, nightHours NICHT', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })

            await prisma.timesheet.create({
                data: {
                    employeeId: employee!.id,
                    date: createLocalDate(2026, 3, 26),
                    plannedStart: '22:00', plannedEnd: '06:00',
                    status: 'PLANNED', absenceType: 'SICK',
                    month: 3, year: 2026, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_SICK_NIGHT`
                }
            })

            const response = await page.request.get(
                `/api/timesheets/export?month=3&year=2026&employeeId=${employee!.id}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            expect(rows[0]['L_Krankheitstage']).toBe(1)
            expect(rows[0]['M_Krankstunden']).toBe(8)
            // Night hours should NOT be counted for sick shifts (not worked)
            expect(rows[0]['H_Nachtstunden']).toBe(0)
        })
    })

    // ============================================================
    // SUITE 5: Backup-Tage/Bereitschaftstage (5 Tests)
    // ============================================================
    test.describe('Suite 5: Backup-Tage (Bereitschaftstage)', () => {

        test('Main krank, Backup eingesprungen = backupDays=1', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
            const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })

            const testDate = createLocalDate(2026, 4, 14) // Tuesday

            // Main is sick with backup assigned
            await prisma.timesheet.create({
                data: {
                    employeeId: employee!.id,
                    backupEmployeeId: backupEmployee!.id,
                    date: testDate,
                    plannedStart: '08:00', plannedEnd: '16:00',
                    status: 'PLANNED', absenceType: 'SICK',
                    month: 4, year: 2026, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_BACKUP_MAIN`
                }
            })

            // Backup jumped in
            await prisma.timesheet.create({
                data: {
                    employeeId: backupEmployee!.id,
                    date: testDate,
                    plannedStart: '08:00', plannedEnd: '16:00',
                    actualStart: '08:00', actualEnd: '16:00',
                    status: 'CONFIRMED',
                    month: 4, year: 2026, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_BACKUP Eingesprungen für Krankheit`
                }
            })

            // Export ALL employees (needed for backup calculation)
            const response = await page.request.get(
                `/api/timesheets/export?month=4&year=2026`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            const backupRow = rows.find((r: any) => r['C_Name'] === backupEmployee!.name)
            expect(backupRow).toBeTruthy()
            expect(backupRow['K_Bereitschaftstage']).toBeGreaterThanOrEqual(1)
        })

        test('Backup arbeitet Nachtschicht = Nachtstunden korrekt berechnet', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
            const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })

            // Use a unique month/year to avoid conflicts with existing data
            const testMonth = 7 // July
            const testYear = 2029 // Far future
            const testDate = createLocalDate(testYear, testMonth, 15)

            // Clean up any existing data for this period
            await prisma.timesheet.deleteMany({
                where: { month: testMonth, year: testYear }
            })

            // Main is sick with backup assigned
            await prisma.timesheet.create({
                data: {
                    employeeId: employee!.id,
                    backupEmployeeId: backupEmployee!.id,
                    date: testDate,
                    plannedStart: '22:00', plannedEnd: '06:00',
                    status: 'PLANNED', absenceType: 'SICK',
                    month: testMonth, year: testYear, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_BACKUP_NIGHT_MAIN`
                }
            })

            // Backup's shift (created by system when main is sick)
            await prisma.timesheet.create({
                data: {
                    employeeId: backupEmployee!.id,
                    date: testDate,
                    plannedStart: '22:00', plannedEnd: '06:00',
                    actualStart: '22:00', actualEnd: '06:00',
                    status: 'CONFIRMED',
                    month: testMonth, year: testYear, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_BACKUP Eingesprungen für Krankheit`
                }
            })

            // Export ALL employees (needed for backup calculation)
            const response = await page.request.get(
                `/api/timesheets/export?month=${testMonth}&year=${testYear}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            const backupRow = rows.find((r: any) => r['C_Name'] === backupEmployee!.name)
            expect(backupRow).toBeTruthy()
            // Backup gets: 7h from own shift + 7h from backup credit = 14h
            // This is current behavior: backup hours are ADDED to regular hours
            expect(backupRow['H_Nachtstunden']).toBe(14)

            // Cleanup
            await prisma.timesheet.deleteMany({
                where: { month: testMonth, year: testYear }
            })
        })

        test('Backup arbeitet Sonntagsschicht = Sonntagsstunden korrekt berechnet', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
            const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })

            // Use a unique month/year to avoid conflicts with existing data
            // 2029-08-05 is a Sunday
            const testMonth = 8
            const testYear = 2029
            const testDate = createLocalDate(testYear, testMonth, 5) // Sunday

            // Clean up any existing data for this period
            await prisma.timesheet.deleteMany({
                where: { month: testMonth, year: testYear }
            })

            // Main is sick with backup assigned
            await prisma.timesheet.create({
                data: {
                    employeeId: employee!.id,
                    backupEmployeeId: backupEmployee!.id,
                    date: testDate,
                    plannedStart: '08:00', plannedEnd: '16:00',
                    status: 'PLANNED', absenceType: 'SICK',
                    month: testMonth, year: testYear, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_BACKUP_SUN_MAIN`
                }
            })

            // Backup's shift (created by system when main is sick)
            await prisma.timesheet.create({
                data: {
                    employeeId: backupEmployee!.id,
                    date: testDate,
                    plannedStart: '08:00', plannedEnd: '16:00',
                    actualStart: '08:00', actualEnd: '16:00',
                    status: 'CONFIRMED',
                    month: testMonth, year: testYear, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_BACKUP Eingesprungen für Krankheit`
                }
            })

            // Export ALL employees (needed for backup calculation)
            const response = await page.request.get(
                `/api/timesheets/export?month=${testMonth}&year=${testYear}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            const backupRow = rows.find((r: any) => r['C_Name'] === backupEmployee!.name)
            expect(backupRow).toBeTruthy()
            // Backup gets: 8h from own shift + 8h from backup credit = 16h
            expect(backupRow['I_Sonntagsstunden']).toBe(16)

            // Cleanup
            await prisma.timesheet.deleteMany({
                where: { month: testMonth, year: testYear }
            })
        })

        test('Backup arbeitet Feiertagsschicht = Feiertagsstunden korrekt berechnet', async ({ prisma, testUsers, page }) => {
            const employee = await prisma.user.findUnique({ where: { email: testUsers.employee.email } })
            const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })

            // Use 2029-05-01 which is Tag der Arbeit (and a unique year for testing)
            const testMonth = 5
            const testYear = 2029
            const testDate = createLocalDate(testYear, testMonth, 1) // Tag der Arbeit

            // Clean up any existing data for this period
            await prisma.timesheet.deleteMany({
                where: { month: testMonth, year: testYear }
            })

            // Main is sick with backup assigned
            await prisma.timesheet.create({
                data: {
                    employeeId: employee!.id,
                    backupEmployeeId: backupEmployee!.id,
                    date: testDate,
                    plannedStart: '08:00', plannedEnd: '16:00',
                    status: 'PLANNED', absenceType: 'SICK',
                    month: testMonth, year: testYear, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_BACKUP_HOL_MAIN`
                }
            })

            // Backup's shift (created by system when main is sick)
            await prisma.timesheet.create({
                data: {
                    employeeId: backupEmployee!.id,
                    date: testDate,
                    plannedStart: '08:00', plannedEnd: '16:00',
                    actualStart: '08:00', actualEnd: '16:00',
                    status: 'CONFIRMED',
                    month: testMonth, year: testYear, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_BACKUP Eingesprungen für Krankheit`
                }
            })

            // Export ALL employees (needed for backup calculation)
            const response = await page.request.get(
                `/api/timesheets/export?month=${testMonth}&year=${testYear}`
            )
            expect(response.ok()).toBeTruthy()

            const rows = await parseExcelResponse(response)
            const backupRow = rows.find((r: any) => r['C_Name'] === backupEmployee!.name)
            expect(backupRow).toBeTruthy()
            // Backup gets: 8h from own shift + 8h from backup credit = 16h
            expect(backupRow['J_Feiertagsstunden']).toBe(16)

            // Cleanup
            await prisma.timesheet.deleteMany({
                where: { month: testMonth, year: testYear }
            })
        })

        test('Backup krank bei Backup-Schicht = Schicht wird gelöscht, NICHT als krank gezählt', async ({ page, prisma, testUsers, loginPage }) => {
            const backupEmployee = await prisma.user.findUnique({ where: { email: testUsers.backup.email } })

            const testDate = createLocalDate(2026, 4, 20)

            // Create backup shift with "Eingesprungen" note
            const backupShift = await prisma.timesheet.create({
                data: {
                    employeeId: backupEmployee!.id,
                    date: testDate,
                    plannedStart: '08:00', plannedEnd: '16:00',
                    status: 'PLANNED',
                    month: 4, year: 2026, breakMinutes: 0,
                    note: `${TEST_NOTE_PREFIX}_BACKUP_SICK Eingesprungen für Krankheit`
                }
            })

            // Login as backup employee
            await page.context().clearCookies()
            await loginPage.goto()
            await loginPage.login(testUsers.backup.email, testUsers.backup.password)
            await page.waitForURL(/\/dashboard/)

            // Mark as sick
            const response = await page.request.post('/api/timesheets', {
                data: {
                    id: backupShift.id,
                    absenceType: 'SICK'
                }
            })

            const result = await response.json()

            // Should be deleted, not marked as sick
            expect(result.deleted).toBe(true)

            // Verify shift no longer exists
            const deletedShift = await prisma.timesheet.findUnique({
                where: { id: backupShift.id }
            })
            expect(deletedShift).toBeNull()
        })
    })
})
