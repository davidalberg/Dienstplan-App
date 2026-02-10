import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { Resend } from "resend"
import { getReminderEmailHTML, getReminderEmailText, getReminderEmailSubject, ReminderType } from "@/lib/email-templates"
import { PRE_SUBMISSION_STATUSES } from "@/lib/constants"
import { timingSafeEqual } from "crypto"

/**
 * Cron Job: Remind Employees about Unsigned Timesheets
 *
 * Vercel Cron: Runs daily at 09:00 UTC
 * Schedule: 0 9 * * *
 *
 * NEUE LOGIK (basierend auf letztem Dienst des Mitarbeiters):
 *
 * 1. LAST_SHIFT_DAY: Am Tag des letzten Dienstes im Monat
 *    → "Heute ist dein letzter Dienst. Bitte unterschreibe nach Dienstende."
 *
 * 2. DEADLINE: 2 Tage nach letztem Dienst
 *    → "Bitte unterschreibe. Wir brauchen das."
 *
 * 3. OVERDUE: Am 2. des Folgemonats
 *    → "Dringende Aufforderung! Wir brauchen bis heute Nachmittag die Unterschrift."
 *
 * 4. URGENT: Am 4. des Folgemonats (CC: info@assistenzplus.de)
 *    → "DRINGEND! Administration wurde informiert."
 *
 * Auth: Requires CRON_SECRET in authorization header
 */

const ADMIN_EMAIL = "info@assistenzplus.de"

// ✅ PERFORMANCE: Batch-Parallelisierung für E-Mail-Versand
const chunkArray = <T>(arr: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
    )

// E-Mail-Typ für Batch-Verarbeitung
interface EmailTask {
    email: string
    name: string
    reminderType: ReminderType
    targetMonth: number
    targetYear: number
    shifts?: Array<{ date: string; time: string }>
    daysUntilDeadline?: number
    daysOverdue?: number
    cc?: string[]
}

export async function GET(req: NextRequest) {
    // Auth check: Require CRON_SECRET
    const authHeader = req.headers.get("authorization")
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`

    function safeCompare(a: string, b: string): boolean {
        if (a.length !== b.length) return false
        return timingSafeEqual(Buffer.from(a), Buffer.from(b))
    }
    if (!authHeader || !safeCompare(authHeader, expectedAuth)) {
        console.error("[Cron: remind-employees] Unauthorized access attempt")
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const now = new Date()
        const currentMonth = now.getMonth() + 1 // 1-12
        const currentYear = now.getFullYear()
        const currentDay = now.getDate()
        const todayStr = now.toISOString().split("T")[0] // YYYY-MM-DD

        // Initialize Resend
        if (!process.env.RESEND_API_KEY) {
            throw new Error("RESEND_API_KEY not configured")
        }
        const resend = new Resend(process.env.RESEND_API_KEY)
        const fromEmail = process.env.EMAIL_FROM || "Dienstplan App <onboarding@resend.dev>"
        const dashboardUrl = process.env.NEXTAUTH_URL
            ? `${process.env.NEXTAUTH_URL}/dashboard`
            : "https://dienstplan.assistenzplus.de/dashboard"

        const results: { type: string; email: string; success: boolean }[] = []
        // ✅ PERFORMANCE: Sammle alle E-Mails und sende sie batch-weise am Ende
        const emailTasks: EmailTask[] = []

        // =========================================================================
        // SCENARIO 1: Am Tag des letzten Dienstes - Info E-Mail
        // "Heute ist dein letzter Dienst. Bitte unterschreibe nach Dienstende."
        // =========================================================================

        // Finde alle Mitarbeiter deren letzter Dienst HEUTE ist
        const employeesWithLastShiftToday = await prisma.user.findMany({
            where: {
                role: "EMPLOYEE",
                AND: [
                    { email: { not: "" } },
                    { email: { not: undefined } }
                ],
                timesheets: {
                    some: {
                        month: currentMonth,
                        year: currentYear,
                        status: { in: [...PRE_SUBMISSION_STATUSES] },
                        absenceType: null // Nur echte Schichten, keine Urlaub/Krank
                    }
                }
            },
            include: {
                timesheets: {
                    where: {
                        month: currentMonth,
                        year: currentYear,
                        status: { in: [...PRE_SUBMISSION_STATUSES] },
                        absenceType: null
                    },
                    orderBy: { date: "desc" }
                }
            }
        })

        // ✅ PERFORMANCE: Batch-Abfrage für alle EmployeeSignatures statt N einzelner Queries
        const employeeIds = employeesWithLastShiftToday.map(e => e.id)
        const unsignedSignatures = await prisma.employeeSignature.findMany({
            where: {
                employeeId: { in: employeeIds },
                signature: null,
                teamSubmission: {
                    month: currentMonth,
                    year: currentYear
                }
            },
            select: { employeeId: true }
        })
        const unsignedEmployeeIds = new Set(unsignedSignatures.map(s => s.employeeId))

        const twoDaysAgo = new Date(now)
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
        const twoDaysAgoStr = twoDaysAgo.toISOString().split("T")[0]

        for (const employee of employeesWithLastShiftToday) {
            if (!employee.email || employee.timesheets.length === 0) continue

            // Finde den letzten Dienst des Mitarbeiters im Monat
            const lastShift = employee.timesheets[0]
            const lastShiftDate = new Date(lastShift.date).toISOString().split("T")[0]

            // SCENARIO 1: Letzter Dienst ist HEUTE
            if (lastShiftDate === todayStr && unsignedEmployeeIds.has(employee.id)) {
                const shifts = employee.timesheets.map(ts => ({
                    date: new Date(ts.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
                    time: `${ts.plannedStart || "?"}-${ts.plannedEnd || "?"}`
                }))

                emailTasks.push({
                    email: employee.email,
                    name: employee.name || "Mitarbeiter",
                    reminderType: "LAST_SHIFT_DAY",
                    targetMonth: currentMonth,
                    targetYear: currentYear,
                    shifts
                })
            }

            // SCENARIO 2: Letzter Dienst war vor 2 Tagen
            if (lastShiftDate === twoDaysAgoStr && unsignedEmployeeIds.has(employee.id)) {
                const shifts = employee.timesheets.map(ts => ({
                    date: new Date(ts.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
                    time: `${ts.plannedStart || "?"}-${ts.plannedEnd || "?"}`
                }))

                emailTasks.push({
                    email: employee.email,
                    name: employee.name || "Mitarbeiter",
                    reminderType: "DEADLINE",
                    targetMonth: currentMonth,
                    targetYear: currentYear,
                    shifts,
                    daysUntilDeadline: 0
                })
            }
        }

        // =========================================================================
        // SCENARIO 3: Am 2. des Monats - Überfällig (für Vormonat)
        // =========================================================================

        if (currentDay === 2) {
            // Target LAST month
            const targetMonth = currentMonth === 1 ? 12 : currentMonth - 1
            const targetYear = currentMonth === 1 ? currentYear - 1 : currentYear

            const unsignedEmployees = await prisma.employeeSignature.findMany({
                where: {
                    signature: null,
                    teamSubmission: {
                        month: targetMonth,
                        year: targetYear,
                        status: { not: "COMPLETED" }
                    }
                },
                include: {
                    employee: {
                        select: { id: true, name: true, email: true }
                    },
                    teamSubmission: true
                }
            })

            const employeeMap = new Map<string, { name: string; email: string; count: number }>()
            for (const sig of unsignedEmployees) {
                if (!sig.employee.email) continue
                const existing = employeeMap.get(sig.employeeId)
                if (existing) {
                    existing.count++
                } else {
                    employeeMap.set(sig.employeeId, {
                        name: sig.employee.name || "Mitarbeiter",
                        email: sig.employee.email,
                        count: 1
                    })
                }
            }

            for (const [, empData] of employeeMap) {
                emailTasks.push({
                    email: empData.email,
                    name: empData.name,
                    reminderType: "OVERDUE",
                    targetMonth,
                    targetYear,
                    daysOverdue: 2
                })
            }
        }

        // =========================================================================
        // SCENARIO 4: Am 4. des Monats - DRINGEND mit CC an Admin
        // =========================================================================

        if (currentDay === 4) {
            // Target LAST month
            const targetMonth = currentMonth === 1 ? 12 : currentMonth - 1
            const targetYear = currentMonth === 1 ? currentYear - 1 : currentYear

            const unsignedEmployees = await prisma.employeeSignature.findMany({
                where: {
                    signature: null,
                    teamSubmission: {
                        month: targetMonth,
                        year: targetYear,
                        status: { not: "COMPLETED" }
                    }
                },
                include: {
                    employee: {
                        select: { id: true, name: true, email: true }
                    },
                    teamSubmission: true
                }
            })

            const employeeMap = new Map<string, { name: string; email: string; count: number }>()
            for (const sig of unsignedEmployees) {
                if (!sig.employee.email) continue
                const existing = employeeMap.get(sig.employeeId)
                if (existing) {
                    existing.count++
                } else {
                    employeeMap.set(sig.employeeId, {
                        name: sig.employee.name || "Mitarbeiter",
                        email: sig.employee.email,
                        count: 1
                    })
                }
            }

            for (const [, empData] of employeeMap) {
                emailTasks.push({
                    email: empData.email,
                    name: empData.name,
                    reminderType: "URGENT",
                    targetMonth,
                    targetYear,
                    daysOverdue: 4,
                    cc: [ADMIN_EMAIL]
                })
            }
        }

        // =========================================================================
        // ✅ PERFORMANCE: Batch-weise E-Mail-Versand (10 E-Mails parallel)
        // Reduziert 55s → ~10s für 100 E-Mails
        // =========================================================================

        const BATCH_SIZE = 10
        const BATCH_DELAY_MS = 1000 // 1 Sekunde zwischen Batches (Rate Limiting)

        const emailBatches = chunkArray(emailTasks, BATCH_SIZE)

        for (const batch of emailBatches) {
            const batchResults = await Promise.all(
                batch.map(async (task) => {
                    try {
                        await resend.emails.send({
                            from: fromEmail,
                            to: task.email,
                            cc: task.cc,
                            subject: getReminderEmailSubject(task.reminderType, task.targetMonth, task.targetYear),
                            html: getReminderEmailHTML(task.reminderType, {
                                employeeName: task.name,
                                month: task.targetMonth,
                                year: task.targetYear,
                                unconfirmedCount: task.shifts?.length || 1,
                                daysUntilDeadline: task.daysUntilDeadline,
                                daysOverdue: task.daysOverdue,
                                dashboardUrl,
                                shifts: task.shifts
                            }),
                            text: getReminderEmailText(task.reminderType, {
                                employeeName: task.name,
                                month: task.targetMonth,
                                year: task.targetYear,
                                unconfirmedCount: task.shifts?.length || 1,
                                daysUntilDeadline: task.daysUntilDeadline,
                                daysOverdue: task.daysOverdue,
                                dashboardUrl,
                                shifts: task.shifts
                            })
                        })

                        return { type: task.reminderType, email: task.email, success: true }
                    } catch (emailError) {
                        console.error(`[Cron] Failed ${task.reminderType} to ${task.email}:`, emailError)
                        return { type: task.reminderType, email: task.email, success: false }
                    }
                })
            )

            results.push(...batchResults)

            // Rate limiting: Warte zwischen Batches (außer beim letzten)
            if (emailBatches.indexOf(batch) < emailBatches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS))
            }
        }

        const remindersSent = results.filter(r => r.success).length

        return NextResponse.json({
            success: true,
            message: `Reminder cron job completed`,
            remindersSent,
            results,
            currentDay,
            currentMonth,
            currentYear
        })

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        console.error("[Cron: remind-employees] Error:", errorMessage, error)
        return NextResponse.json({
            error: "Internal server error",
            details: errorMessage
        }, { status: 500 })
    }
}
