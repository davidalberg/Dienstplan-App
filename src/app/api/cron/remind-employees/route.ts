import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { Resend } from "resend"
import { getReminderEmailHTML, getReminderEmailText, getReminderEmailSubject, ReminderType } from "@/lib/email-templates"

/**
 * Cron Job: Remind Employees about Unconfirmed Shifts
 *
 * Vercel Cron: Runs daily at 09:00 UTC
 * Schedule: 0 9 * * *
 *
 * Scenarios:
 * 1. 3 days before month end: Remind employees with unconfirmed shifts
 * 2. 1 day after month end: First overdue reminder
 * 3. 3 days after month end: Second overdue reminder (CC admin)
 *
 * Auth: Requires CRON_SECRET in authorization header
 */
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

        // Calculate days until month end
        const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate()
        const daysUntilMonthEnd = lastDayOfMonth - currentDay

        console.log("[Cron: remind-employees] Running check", {
            currentMonth,
            currentYear,
            currentDay,
            lastDayOfMonth,
            daysUntilMonthEnd
        })

        // Initialize Resend
        if (!process.env.RESEND_API_KEY) {
            throw new Error("RESEND_API_KEY not configured")
        }
        const resend = new Resend(process.env.RESEND_API_KEY)
        const fromEmail = process.env.EMAIL_FROM || "Dienstplan App <onboarding@resend.dev>"
        const dashboardUrl = process.env.NEXTAUTH_URL
            ? `${process.env.NEXTAUTH_URL}/dashboard`
            : "https://yourdomain.com/dashboard"

        let remindersSent = 0
        let reminderType: ReminderType | null = null
        let targetMonth = currentMonth
        let targetYear = currentYear

        // =========================================================================
        // Scenario 0: 7 days before month end - Early Reminder (informativ)
        // =========================================================================
        if (daysUntilMonthEnd === 7) {
            console.log("[Cron: remind-employees] Scenario 0: 7 days before month end (Early Reminder)")
            reminderType = "EARLY_REMINDER"

            // Find employees with unconfirmed shifts in current month
            const employeesWithUnconfirmed = await prisma.user.findMany({
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
                            status: { in: ["PLANNED", "CHANGED"] }
                        }
                    }
                },
                include: {
                    timesheets: {
                        where: {
                            month: currentMonth,
                            year: currentYear,
                            status: { in: ["PLANNED", "CHANGED"] }
                        },
                        orderBy: { date: "asc" }
                    }
                }
            })

            console.log(`[Cron: remind-employees] Found ${employeesWithUnconfirmed.length} employees with unconfirmed shifts`)

            for (const employee of employeesWithUnconfirmed) {
                if (!employee.email) continue

                const unconfirmedCount = employee.timesheets.length

                // Konvertiere Schichten zu ShiftInfo für E-Mail
                const shifts = employee.timesheets.map(ts => ({
                    date: new Date(ts.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
                    time: `${ts.plannedStart || "?"}-${ts.plannedEnd || "?"}`
                }))

                try {
                    const htmlContent = getReminderEmailHTML(reminderType, {
                        employeeName: employee.name || "Mitarbeiter",
                        month: currentMonth,
                        year: currentYear,
                        unconfirmedCount,
                        daysUntilDeadline: 7,
                        dashboardUrl,
                        shifts
                    })

                    const textContent = getReminderEmailText(reminderType, {
                        employeeName: employee.name || "Mitarbeiter",
                        month: currentMonth,
                        year: currentYear,
                        unconfirmedCount,
                        daysUntilDeadline: 7,
                        dashboardUrl,
                        shifts
                    })

                    const subject = getReminderEmailSubject(reminderType, currentMonth, currentYear)

                    await resend.emails.send({
                        from: fromEmail,
                        to: employee.email,
                        subject,
                        html: htmlContent,
                        text: textContent
                    })

                    remindersSent++
                    console.log(`[Cron: remind-employees] Sent early reminder to ${employee.email}`)
                } catch (emailError) {
                    console.error(`[Cron: remind-employees] Failed to send email to ${employee.email}:`, emailError)
                }
            }
        }

        // =========================================================================
        // Scenario 1: 3 days before month end - Reminder
        // =========================================================================
        else if (daysUntilMonthEnd === 3) {
            console.log("[Cron: remind-employees] Scenario 1: 3 days before month end")
            reminderType = "BEFORE_DEADLINE"

            // Find employees with unconfirmed shifts in current month
            const employeesWithUnconfirmed = await prisma.user.findMany({
                where: {
                    role: "EMPLOYEE",
                    AND: [
                        { email: { not: "" } },      // Filter out empty emails
                        { email: { not: undefined } } // Filter out null emails via undefined check
                    ],
                    timesheets: {
                        some: {
                            month: currentMonth,
                            year: currentYear,
                            status: { in: ["PLANNED", "CHANGED"] } // Not CONFIRMED/SUBMITTED
                        }
                    }
                },
                include: {
                    timesheets: {
                        where: {
                            month: currentMonth,
                            year: currentYear,
                            status: { in: ["PLANNED", "CHANGED"] }
                        },
                        orderBy: { date: "asc" }
                    }
                }
            })

            console.log(`[Cron: remind-employees] Found ${employeesWithUnconfirmed.length} employees with unconfirmed shifts`)

            for (const employee of employeesWithUnconfirmed) {
                if (!employee.email) continue

                const unconfirmedCount = employee.timesheets.length

                // Konvertiere Schichten zu ShiftInfo für E-Mail
                const shifts = employee.timesheets.map(ts => ({
                    date: new Date(ts.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
                    time: `${ts.plannedStart || "?"}-${ts.plannedEnd || "?"}`
                }))

                try {
                    const htmlContent = getReminderEmailHTML(reminderType, {
                        employeeName: employee.name || "Mitarbeiter",
                        month: currentMonth,
                        year: currentYear,
                        unconfirmedCount,
                        daysUntilDeadline: 3,
                        dashboardUrl,
                        shifts
                    })

                    const textContent = getReminderEmailText(reminderType, {
                        employeeName: employee.name || "Mitarbeiter",
                        month: currentMonth,
                        year: currentYear,
                        unconfirmedCount,
                        daysUntilDeadline: 3,
                        dashboardUrl,
                        shifts
                    })

                    const subject = getReminderEmailSubject(reminderType, currentMonth, currentYear)

                    await resend.emails.send({
                        from: fromEmail,
                        to: employee.email,
                        subject,
                        html: htmlContent,
                        text: textContent
                    })

                    remindersSent++
                    console.log(`[Cron: remind-employees] Sent reminder to ${employee.email}`)
                } catch (emailError) {
                    console.error(`[Cron: remind-employees] Failed to send email to ${employee.email}:`, emailError)
                }
            }
        }

        // =========================================================================
        // Scenario 2: 1 day after month end - First overdue reminder
        // =========================================================================
        else if (daysUntilMonthEnd === -1) {
            console.log("[Cron: remind-employees] Scenario 2: 1 day overdue")
            reminderType = "OVERDUE_1"

            // Target LAST month
            targetMonth = currentMonth === 1 ? 12 : currentMonth - 1
            targetYear = currentMonth === 1 ? currentYear - 1 : currentYear

            // Find incomplete submissions
            const incompleteSubmissions = await prisma.teamSubmission.findMany({
                where: {
                    month: targetMonth,
                    year: targetYear,
                    status: { not: "COMPLETED" }
                },
                include: {
                    employeeSignatures: {
                        where: {
                            signature: null // Not signed yet
                        },
                        include: {
                            employee: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true
                                }
                            }
                        }
                    }
                }
            })

            console.log(`[Cron: remind-employees] Found ${incompleteSubmissions.length} incomplete submissions`)

            // Collect unique employees who haven't signed
            const unsignedEmployeesMap = new Map<string, {
                email: string
                name: string
                unconfirmedCount: number
            }>()

            for (const submission of incompleteSubmissions) {
                for (const empSig of submission.employeeSignatures) {
                    if (!empSig.employee.email) continue

                    const existing = unsignedEmployeesMap.get(empSig.employeeId)
                    if (existing) {
                        existing.unconfirmedCount++
                    } else {
                        unsignedEmployeesMap.set(empSig.employeeId, {
                            email: empSig.employee.email,
                            name: empSig.employee.name || "Mitarbeiter",
                            unconfirmedCount: 1
                        })
                    }
                }
            }

            console.log(`[Cron: remind-employees] Found ${unsignedEmployeesMap.size} employees to remind`)

            for (const [employeeId, empData] of unsignedEmployeesMap) {
                try {
                    const htmlContent = getReminderEmailHTML(reminderType, {
                        employeeName: empData.name,
                        month: targetMonth,
                        year: targetYear,
                        unconfirmedCount: empData.unconfirmedCount,
                        daysOverdue: 1,
                        dashboardUrl
                    })

                    const textContent = getReminderEmailText(reminderType, {
                        employeeName: empData.name,
                        month: targetMonth,
                        year: targetYear,
                        unconfirmedCount: empData.unconfirmedCount,
                        daysOverdue: 1,
                        dashboardUrl
                    })

                    const subject = getReminderEmailSubject(reminderType, targetMonth, targetYear)

                    await resend.emails.send({
                        from: fromEmail,
                        to: empData.email,
                        subject,
                        html: htmlContent,
                        text: textContent
                    })

                    remindersSent++
                    console.log(`[Cron: remind-employees] Sent overdue reminder to ${empData.email}`)
                } catch (emailError) {
                    console.error(`[Cron: remind-employees] Failed to send email to ${empData.email}:`, emailError)
                }
            }
        }

        // =========================================================================
        // Scenario 3: 3 days after month end - Second overdue reminder (CC admin)
        // =========================================================================
        else if (daysUntilMonthEnd === -3) {
            console.log("[Cron: remind-employees] Scenario 3: 3 days overdue (CC admin)")
            reminderType = "OVERDUE_3"

            // Target LAST month
            targetMonth = currentMonth === 1 ? 12 : currentMonth - 1
            targetYear = currentMonth === 1 ? currentYear - 1 : currentYear

            // Find incomplete submissions
            const incompleteSubmissions = await prisma.teamSubmission.findMany({
                where: {
                    month: targetMonth,
                    year: targetYear,
                    status: { not: "COMPLETED" }
                },
                include: {
                    employeeSignatures: {
                        where: {
                            signature: null
                        },
                        include: {
                            employee: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true
                                }
                            }
                        }
                    }
                }
            })

            console.log(`[Cron: remind-employees] Found ${incompleteSubmissions.length} incomplete submissions`)

            // Collect unique employees who haven't signed
            const unsignedEmployeesMap = new Map<string, {
                email: string
                name: string
                unconfirmedCount: number
            }>()

            for (const submission of incompleteSubmissions) {
                for (const empSig of submission.employeeSignatures) {
                    if (!empSig.employee.email) continue

                    const existing = unsignedEmployeesMap.get(empSig.employeeId)
                    if (existing) {
                        existing.unconfirmedCount++
                    } else {
                        unsignedEmployeesMap.set(empSig.employeeId, {
                            email: empSig.employee.email,
                            name: empSig.employee.name || "Mitarbeiter",
                            unconfirmedCount: 1
                        })
                    }
                }
            }

            console.log(`[Cron: remind-employees] Found ${unsignedEmployeesMap.size} employees to remind (with CC admin)`)

            // Get admin emails for CC
            const admins = await prisma.user.findMany({
                where: {
                    role: "ADMIN",
                    AND: [
                        { email: { not: "" } },
                        { email: { not: undefined } }
                    ]
                },
                select: { email: true }
            })

            const adminEmails = admins.map(a => a.email).filter(Boolean) as string[]

            for (const [employeeId, empData] of unsignedEmployeesMap) {
                try {
                    const htmlContent = getReminderEmailHTML(reminderType, {
                        employeeName: empData.name,
                        month: targetMonth,
                        year: targetYear,
                        unconfirmedCount: empData.unconfirmedCount,
                        daysOverdue: 3,
                        dashboardUrl
                    })

                    const textContent = getReminderEmailText(reminderType, {
                        employeeName: empData.name,
                        month: targetMonth,
                        year: targetYear,
                        unconfirmedCount: empData.unconfirmedCount,
                        daysOverdue: 3,
                        dashboardUrl
                    })

                    const subject = getReminderEmailSubject(reminderType, targetMonth, targetYear)

                    // Send to employee + CC admin(s)
                    const recipients = [empData.email, ...adminEmails]

                    await resend.emails.send({
                        from: fromEmail,
                        to: empData.email,
                        cc: adminEmails.length > 0 ? adminEmails : undefined,
                        subject,
                        html: htmlContent,
                        text: textContent
                    })

                    remindersSent++
                    console.log(`[Cron: remind-employees] Sent urgent reminder to ${empData.email} (CC: ${adminEmails.join(', ')})`)
                } catch (emailError) {
                    console.error(`[Cron: remind-employees] Failed to send email to ${empData.email}:`, emailError)
                }
            }
        } else {
            console.log(`[Cron: remind-employees] No action needed (daysUntilMonthEnd: ${daysUntilMonthEnd})`)
        }

        return NextResponse.json({
            success: true,
            message: `Reminder cron job completed`,
            remindersSent,
            reminderType,
            targetMonth,
            targetYear,
            daysUntilMonthEnd
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
