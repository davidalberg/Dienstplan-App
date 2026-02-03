import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { Resend } from "resend"
import { getReminderEmailHTML, getReminderEmailText, getReminderEmailSubject, ReminderType } from "@/lib/email-templates"

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

export async function GET(req: NextRequest) {
    // Auth check: Require CRON_SECRET
    const authHeader = req.headers.get("authorization")
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`

    if (!authHeader || authHeader !== expectedAuth) {
        console.error("[Cron: remind-employees] Unauthorized access attempt")
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const now = new Date()
        const currentMonth = now.getMonth() + 1 // 1-12
        const currentYear = now.getFullYear()
        const currentDay = now.getDate()
        const todayStr = now.toISOString().split("T")[0] // YYYY-MM-DD

        console.log("[Cron: remind-employees] Running check", {
            currentMonth,
            currentYear,
            currentDay,
            todayStr
        })

        // Initialize Resend
        if (!process.env.RESEND_API_KEY) {
            throw new Error("RESEND_API_KEY not configured")
        }
        const resend = new Resend(process.env.RESEND_API_KEY)
        const fromEmail = process.env.EMAIL_FROM || "Dienstplan App <onboarding@resend.dev>"
        const dashboardUrl = process.env.NEXTAUTH_URL
            ? `${process.env.NEXTAUTH_URL}/dashboard`
            : "https://dienstplan.assistenzplus.de/dashboard"

        let remindersSent = 0
        const results: { type: string; email: string; success: boolean }[] = []

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
                        status: { in: ["PLANNED", "CONFIRMED", "CHANGED"] },
                        absenceType: null // Nur echte Schichten, keine Urlaub/Krank
                    }
                }
            },
            include: {
                timesheets: {
                    where: {
                        month: currentMonth,
                        year: currentYear,
                        status: { in: ["PLANNED", "CONFIRMED", "CHANGED"] },
                        absenceType: null
                    },
                    orderBy: { date: "desc" }
                }
            }
        })

        for (const employee of employeesWithLastShiftToday) {
            if (!employee.email || employee.timesheets.length === 0) continue

            // Finde den letzten Dienst des Mitarbeiters im Monat
            const lastShift = employee.timesheets[0]
            const lastShiftDate = new Date(lastShift.date).toISOString().split("T")[0]

            if (lastShiftDate === todayStr) {
                // Prüfe ob bereits unterschrieben
                const hasUnsignedSubmissions = await prisma.employeeSignature.findFirst({
                    where: {
                        employeeId: employee.id,
                        signature: null,
                        teamSubmission: {
                            month: currentMonth,
                            year: currentYear
                        }
                    }
                })

                // Nur senden wenn noch nicht unterschrieben
                if (hasUnsignedSubmissions) {
                    const shifts = employee.timesheets.map(ts => ({
                        date: new Date(ts.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
                        time: `${ts.plannedStart || "?"}-${ts.plannedEnd || "?"}`
                    }))

                    try {
                        const reminderType: ReminderType = "LAST_SHIFT_DAY"

                        await resend.emails.send({
                            from: fromEmail,
                            to: employee.email,
                            subject: getReminderEmailSubject(reminderType, currentMonth, currentYear),
                            html: getReminderEmailHTML(reminderType, {
                                employeeName: employee.name || "Mitarbeiter",
                                month: currentMonth,
                                year: currentYear,
                                unconfirmedCount: shifts.length,
                                dashboardUrl,
                                shifts
                            }),
                            text: getReminderEmailText(reminderType, {
                                employeeName: employee.name || "Mitarbeiter",
                                month: currentMonth,
                                year: currentYear,
                                unconfirmedCount: shifts.length,
                                dashboardUrl,
                                shifts
                            })
                        })

                        remindersSent++
                        results.push({ type: "LAST_SHIFT_DAY", email: employee.email, success: true })
                        console.log(`[Cron] Sent LAST_SHIFT_DAY to ${employee.email}`)
                    } catch (emailError) {
                        console.error(`[Cron] Failed LAST_SHIFT_DAY to ${employee.email}:`, emailError)
                        results.push({ type: "LAST_SHIFT_DAY", email: employee.email, success: false })
                    }
                }
            }
        }

        // =========================================================================
        // SCENARIO 2: 2 Tage nach letztem Dienst - Deadline Warnung
        // =========================================================================

        const twoDaysAgo = new Date(now)
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
        const twoDaysAgoStr = twoDaysAgo.toISOString().split("T")[0]

        for (const employee of employeesWithLastShiftToday) {
            if (!employee.email || employee.timesheets.length === 0) continue

            const lastShift = employee.timesheets[0]
            const lastShiftDate = new Date(lastShift.date).toISOString().split("T")[0]

            if (lastShiftDate === twoDaysAgoStr) {
                // Prüfe ob bereits unterschrieben
                const hasUnsignedSubmissions = await prisma.employeeSignature.findFirst({
                    where: {
                        employeeId: employee.id,
                        signature: null,
                        teamSubmission: {
                            month: currentMonth,
                            year: currentYear
                        }
                    }
                })

                if (hasUnsignedSubmissions) {
                    const shifts = employee.timesheets.map(ts => ({
                        date: new Date(ts.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
                        time: `${ts.plannedStart || "?"}-${ts.plannedEnd || "?"}`
                    }))

                    try {
                        const reminderType: ReminderType = "DEADLINE"

                        await resend.emails.send({
                            from: fromEmail,
                            to: employee.email,
                            subject: getReminderEmailSubject(reminderType, currentMonth, currentYear),
                            html: getReminderEmailHTML(reminderType, {
                                employeeName: employee.name || "Mitarbeiter",
                                month: currentMonth,
                                year: currentYear,
                                unconfirmedCount: shifts.length,
                                daysUntilDeadline: 0,
                                dashboardUrl,
                                shifts
                            }),
                            text: getReminderEmailText(reminderType, {
                                employeeName: employee.name || "Mitarbeiter",
                                month: currentMonth,
                                year: currentYear,
                                unconfirmedCount: shifts.length,
                                daysUntilDeadline: 0,
                                dashboardUrl,
                                shifts
                            })
                        })

                        remindersSent++
                        results.push({ type: "DEADLINE", email: employee.email, success: true })
                        console.log(`[Cron] Sent DEADLINE to ${employee.email}`)
                    } catch (emailError) {
                        console.error(`[Cron] Failed DEADLINE to ${employee.email}:`, emailError)
                        results.push({ type: "DEADLINE", email: employee.email, success: false })
                    }
                }
            }
        }

        // =========================================================================
        // SCENARIO 3: Am 2. des Monats - Überfällig (für Vormonat)
        // =========================================================================

        if (currentDay === 2) {
            console.log("[Cron] Scenario 3: 2nd of month - OVERDUE")

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

            for (const [empId, empData] of employeeMap) {
                try {
                    const reminderType: ReminderType = "OVERDUE"

                    await resend.emails.send({
                        from: fromEmail,
                        to: empData.email,
                        subject: getReminderEmailSubject(reminderType, targetMonth, targetYear),
                        html: getReminderEmailHTML(reminderType, {
                            employeeName: empData.name,
                            month: targetMonth,
                            year: targetYear,
                            unconfirmedCount: empData.count,
                            daysOverdue: 2,
                            dashboardUrl
                        }),
                        text: getReminderEmailText(reminderType, {
                            employeeName: empData.name,
                            month: targetMonth,
                            year: targetYear,
                            unconfirmedCount: empData.count,
                            daysOverdue: 2,
                            dashboardUrl
                        })
                    })

                    remindersSent++
                    results.push({ type: "OVERDUE", email: empData.email, success: true })
                    console.log(`[Cron] Sent OVERDUE to ${empData.email}`)
                } catch (emailError) {
                    console.error(`[Cron] Failed OVERDUE to ${empData.email}:`, emailError)
                    results.push({ type: "OVERDUE", email: empData.email, success: false })
                }
            }
        }

        // =========================================================================
        // SCENARIO 4: Am 4. des Monats - DRINGEND mit CC an Admin
        // =========================================================================

        if (currentDay === 4) {
            console.log("[Cron] Scenario 4: 4th of month - URGENT (CC admin)")

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

            for (const [empId, empData] of employeeMap) {
                try {
                    const reminderType: ReminderType = "URGENT"

                    await resend.emails.send({
                        from: fromEmail,
                        to: empData.email,
                        cc: [ADMIN_EMAIL], // CC an info@assistenzplus.de
                        subject: getReminderEmailSubject(reminderType, targetMonth, targetYear),
                        html: getReminderEmailHTML(reminderType, {
                            employeeName: empData.name,
                            month: targetMonth,
                            year: targetYear,
                            unconfirmedCount: empData.count,
                            daysOverdue: 4,
                            dashboardUrl
                        }),
                        text: getReminderEmailText(reminderType, {
                            employeeName: empData.name,
                            month: targetMonth,
                            year: targetYear,
                            unconfirmedCount: empData.count,
                            daysOverdue: 4,
                            dashboardUrl
                        })
                    })

                    remindersSent++
                    results.push({ type: "URGENT", email: empData.email, success: true })
                    console.log(`[Cron] Sent URGENT to ${empData.email} (CC: ${ADMIN_EMAIL})`)
                } catch (emailError) {
                    console.error(`[Cron] Failed URGENT to ${empData.email}:`, emailError)
                    results.push({ type: "URGENT", email: empData.email, success: false })
                }
            }
        }

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
