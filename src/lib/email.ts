import { Resend } from "resend"

/**
 * Escape HTML special characters to prevent HTML injection in email templates.
 * All dynamic string values interpolated into HTML must pass through this function.
 */
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}

const MONTH_NAMES = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

// Initialize Resend client
function getResendClient() {
    if (!process.env.RESEND_API_KEY) {
        throw new Error("E-Mail-Service nicht konfiguriert. Bitte RESEND_API_KEY in den Umgebungsvariablen setzen.")
    }

    return new Resend(process.env.RESEND_API_KEY)
}

/**
 * Check if email service is configured
 * Use this to validate before attempting to send emails
 */
export function isEmailServiceConfigured(): boolean {
    return !!process.env.RESEND_API_KEY
}

interface SendSignatureRequestParams {
    recipientEmail: string
    recipientName: string
    employeeName: string
    month: number
    year: number
    signatureUrl: string
    expiresAt: Date
}

export async function sendSignatureRequestEmail(params: SendSignatureRequestParams) {
    const { recipientEmail, recipientName, employeeName, month, year, signatureUrl, expiresAt } = params

    const resend = getResendClient()
    const fromEmail = process.env.EMAIL_FROM || "Dienstplan App <onboarding@resend.dev>"

    const monthName = MONTH_NAMES[month - 1]
    const expiresFormatted = expiresAt.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    })

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stundennachweis zur Unterschrift</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Stundennachweis zur Unterschrift</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${escapeHtml(monthName)} ${year}</p>
    </div>

    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">
            Hallo ${escapeHtml(recipientName)},
        </p>

        <p style="font-size: 15px; color: #4b5563;">
            das Team hat den Stundennachweis für den <strong>${escapeHtml(monthName)} ${year}</strong> eingereicht.
        </p>

        <p style="font-size: 15px; color: #4b5563;">
            Bitte klicken Sie auf den folgenden Button, um den Nachweis zu prüfen und zu unterschreiben:
        </p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${escapeHtml(signatureUrl)}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
                Jetzt unterschreiben
            </a>
        </div>

        <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>⏰ Hinweis:</strong> Dieser Link ist bis zum <strong>${escapeHtml(expiresFormatted)}</strong> gültig.
            </p>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">

        <p style="font-size: 13px; color: #6b7280;">
            Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br>
            <a href="${escapeHtml(signatureUrl)}" style="color: #3b82f6; word-break: break-all;">${escapeHtml(signatureUrl)}</a>
        </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
        <p>Diese E-Mail wurde automatisch von der Dienstplan App versendet.</p>
    </div>
</body>
</html>
`

    const textContent = `
Stundennachweis zur Unterschrift - ${monthName} ${year}

Hallo ${recipientName},

das Team hat den Stundennachweis für den ${monthName} ${year} eingereicht.

Bitte öffnen Sie den folgenden Link, um den Nachweis zu prüfen und zu unterschreiben:

${signatureUrl}

Hinweis: Dieser Link ist bis zum ${expiresFormatted} gültig.

Mit freundlichen Grüßen,
Dienstplan App
`

    const result = await resend.emails.send({
        from: fromEmail,
        to: recipientEmail,
        subject: `Stundennachweis zur Unterschrift`,
        html: htmlContent,
    })

    // ✅ FIX: Resend API gibt error-Objekt zurück bei Fehlern (wirft keine Exception)
    if (result.error) {
        console.error("[EMAIL] sendSignatureRequestEmail failed:", result.error)
        throw new Error(result.error.message || "E-Mail konnte nicht gesendet werden")
    }

    return { success: true, id: result.data?.id }
}

interface EmployeeInfo {
    email: string
    name: string
}

interface EmployeeSignatureInfo {
    name: string
    signedAt: Date
}

interface SendCompletionEmailParams {
    // OLD: Single employee (for backward compatibility)
    employeeEmail?: string
    employeeName?: string
    employeeSignedAt?: Date

    // NEW: Multiple employees
    employeeEmails?: EmployeeInfo[]
    employeeSignatures?: EmployeeSignatureInfo[]

    // Recipient
    recipientEmail: string
    recipientName: string
    recipientSignedAt: Date

    // Employer
    employerEmail?: string

    // Submission info
    month: number
    year: number
    pdfUrl: string
    totalHours: number
    sheetFileName?: string
}

export async function sendCompletionEmails(params: SendCompletionEmailParams) {
    const {
        employeeEmail, // OLD: single employee
        employeeName, // OLD: single employee
        employeeSignedAt, // OLD: single employee
        employeeEmails, // NEW: multiple employees
        employeeSignatures, // NEW: multiple employee signatures
        recipientEmail,
        recipientName,
        recipientSignedAt,
        employerEmail, // NEW: employer email
        month,
        year,
        pdfUrl,
        totalHours,
        sheetFileName // NEW: for team submissions
    } = params

    const resend = getResendClient()
    const fromEmail = process.env.EMAIL_FROM || "Dienstplan App <onboarding@resend.dev>"

    const monthName = MONTH_NAMES[month - 1]

    // Extract friendly team name from sheetFileName - robustly handle all formats
    const friendlyTeamName = (() => {
        if (!sheetFileName) return recipientName

        let name = sheetFileName

        // Remove all "Team_" prefixes recursively
        while (name.startsWith("Team_")) {
            name = name.substring(5)
        }

        // Split by underscore and remove year patterns (4-digit numbers)
        const parts = name.split("_").filter(part => !/^\d{4}$/.test(part))

        return parts.length > 0 ? parts.join(" ") : recipientName
    })()

    const formatDate = (date: Date) => date.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    })

    const isMultiEmployee = employeeEmails && employeeEmails.length > 0

    // Build employee signatures list for HTML
    let employeeSignaturesHtml = ""
    let employeeSignaturesText = ""

    if (isMultiEmployee && employeeSignatures) {
        employeeSignaturesHtml = employeeSignatures.map((sig, idx) => `
            <tr>
                <td style="padding: 5px 0; color: #6b7280;">${idx === 0 ? "Mitarbeiter:" : ""}</td>
                <td style="padding: 5px 0;">${escapeHtml(sig.name)}</td>
            </tr>
            <tr>
                <td style="padding: 5px 0; color: #6b7280;"></td>
                <td style="padding: 5px 0; font-size: 12px; color: #9ca3af;">${escapeHtml(formatDate(sig.signedAt))}</td>
            </tr>
        `).join("")

        employeeSignaturesText = employeeSignatures.map(sig =>
            `- ${sig.name}, unterschrieben am ${formatDate(sig.signedAt)}`
        ).join("\n")
    } else {
        // OLD: single employee
        employeeSignaturesHtml = `
            <tr>
                <td style="padding: 5px 0; color: #6b7280;">Mitarbeiter:</td>
                <td style="padding: 5px 0; font-weight: 600;">${escapeHtml(employeeName || "")}</td>
            </tr>
            <tr>
                <td style="padding: 5px 0; color: #6b7280;">Unterschrieben am:</td>
                <td style="padding: 5px 0;">${escapeHtml(formatDate(employeeSignedAt!))}</td>
            </tr>
        `
        employeeSignaturesText = `- Mitarbeiter: ${employeeName}, unterschrieben am ${formatDate(employeeSignedAt!)}`
    }

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">✓ Stundennachweis abgeschlossen</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${escapeHtml(monthName)} ${year}</p>
    </div>

    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; color: #4b5563;">
            Der Stundennachweis für <strong>${escapeHtml(monthName)} ${year}</strong> wurde vollständig unterschrieben und ist nun abgeschlossen.
        </p>

        <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="margin: 0 0 15px 0; font-size: 14px; color: #374151; text-transform: uppercase;">Zusammenfassung</h3>
            <table style="width: 100%; font-size: 14px;">
                ${employeeSignaturesHtml}
                <tr>
                    <td colspan="2" style="padding: 10px 0 5px 0; border-top: 1px solid #e5e7eb;"></td>
                </tr>
                <tr>
                    <td style="padding: 5px 0; color: #6b7280;">Assistenznehmer:</td>
                    <td style="padding: 5px 0; font-weight: 600;">${escapeHtml(recipientName)}</td>
                </tr>
                <tr>
                    <td style="padding: 5px 0; color: #6b7280;">Unterschrieben am:</td>
                    <td style="padding: 5px 0;">${escapeHtml(formatDate(recipientSignedAt))}</td>
                </tr>
                <tr>
                    <td colspan="2" style="padding: 10px 0 5px 0; border-top: 1px solid #e5e7eb;"></td>
                </tr>
                <tr>
                    <td style="padding: 5px 0; color: #6b7280;">Gesamtstunden:</td>
                    <td style="padding: 5px 0; font-weight: 600; font-size: 16px;">${totalHours.toFixed(2)} Std.</td>
                </tr>
            </table>
        </div>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${escapeHtml(pdfUrl)}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                PDF herunterladen
            </a>
        </div>
    </div>

    <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
        <p>Diese E-Mail wurde automatisch von der Dienstplan App versendet.</p>
    </div>
</body>
</html>
`

    const textContent = `
Stundennachweis abgeschlossen - ${monthName} ${year}

Der Stundennachweis für ${monthName} ${year} wurde vollständig unterschrieben.

Zusammenfassung:
${employeeSignaturesText}
- Assistenznehmer: ${recipientName}, unterschrieben am ${formatDate(recipientSignedAt)}
- Gesamtstunden: ${totalHours.toFixed(2)} Std.

PDF-Download: ${pdfUrl}

Mit freundlichen Grüßen,
Dienstplan App
`

    // Build list of all recipients
    const emailPromises = []

    if (isMultiEmployee) {
        // NEW: Send to ALL employees
        for (const emp of employeeEmails!) {
            emailPromises.push(
                resend.emails.send({
                    from: fromEmail,
                    to: emp.email,
                    subject: `✓ Stundennachweis abgeschlossen - ${monthName} ${year}`,
                    html: htmlContent,
                })
            )
        }
    } else {
        // OLD: Send to single employee
        emailPromises.push(
            resend.emails.send({
                from: fromEmail,
                to: employeeEmail!,
                subject: `✓ Stundennachweis abgeschlossen - ${monthName} ${year}`,
                html: htmlContent,
            })
        )
    }

    // Send to recipient
    emailPromises.push(
        resend.emails.send({
            from: fromEmail,
            to: recipientEmail,
            subject: `✓ Stundennachweis abgeschlossen - Team ${friendlyTeamName}`,
            html: htmlContent,
        })
    )

    // NEW: Send to employer (only if different from recipient to prevent duplicates)
    if (employerEmail && employerEmail !== recipientEmail) {
        emailPromises.push(
            resend.emails.send({
                from: fromEmail,
                to: employerEmail,
                subject: `✓ Stundennachweis abgeschlossen - Team ${friendlyTeamName}`,
                html: htmlContent,
            })
        )
    }

    // Use Promise.allSettled for better error tolerance - partial failures don't block other emails
    const results = await Promise.allSettled(emailPromises)
    const failed = results.filter(r => r.status === 'rejected')
    if (failed.length > 0) {
        console.error(`[EMAIL] ${failed.length} E-Mails fehlgeschlagen:`,
            failed.map(f => (f as PromiseRejectedResult).reason))
    }
}

/**
 * Send confirmation email to employee after they signed
 * NEW: Part of the signature workflow
 */
interface SendEmployeeConfirmationParams {
    employeeEmail: string
    employeeName: string
    clientName: string
    month: number
    year: number
    signedAt: Date
    totalSigned: number
    totalRequired: number
}

export async function sendEmployeeConfirmationEmail(params: SendEmployeeConfirmationParams) {
    const {
        employeeEmail,
        employeeName,
        clientName,
        month,
        year,
        signedAt,
        totalSigned,
        totalRequired
    } = params

    const resend = getResendClient()
    const fromEmail = process.env.EMAIL_FROM || "Dienstplan App <onboarding@resend.dev>"

    const monthName = MONTH_NAMES[month - 1]
    const signedAtFormatted = signedAt.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    })

    const allSigned = totalSigned === totalRequired
    const statusMessage = allSigned
        ? `Alle ${totalRequired} Assistenten haben unterschrieben. Der Assistenznehmer wird nun per E-Mail benachrichtigt.`
        : `${totalSigned} von ${totalRequired} Assistenten haben unterschrieben. Sobald alle unterschrieben haben, wird der Assistenznehmer benachrichtigt.`

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">✓ Vielen Dank für deine Unterschrift</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${escapeHtml(monthName)} ${year}</p>
    </div>

    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">
            Hallo ${escapeHtml(employeeName)},
        </p>

        <p style="font-size: 15px; color: #4b5563;">
            Deine Unterschrift für den Stundennachweis <strong>${escapeHtml(monthName)} ${year}</strong> bei <strong>${escapeHtml(clientName)}</strong> wurde erfolgreich erfasst.
        </p>

        <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <table style="width: 100%; font-size: 14px;">
                <tr>
                    <td style="padding: 5px 0; color: #6b7280;">Unterschrieben am:</td>
                    <td style="padding: 5px 0; font-weight: 600;">${escapeHtml(signedAtFormatted)}</td>
                </tr>
                <tr>
                    <td style="padding: 5px 0; color: #6b7280;">Status:</td>
                    <td style="padding: 5px 0;">${totalSigned} von ${totalRequired} unterschrieben</td>
                </tr>
            </table>
        </div>

        <div style="background: ${allSigned ? "#d1fae5" : "#fef3c7"}; border: 1px solid ${allSigned ? "#10b981" : "#f59e0b"}; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: ${allSigned ? "#065f46" : "#92400e"}; font-size: 14px;">
                ${allSigned ? "🎉" : "⏳"} ${escapeHtml(statusMessage)}
            </p>
        </div>

        <p style="font-size: 14px; color: #6b7280;">
            Du erhältst eine weitere E-Mail mit dem finalen PDF, sobald auch der Assistenznehmer unterschrieben hat.
        </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
        <p>Diese E-Mail wurde automatisch von der Dienstplan App versendet.</p>
    </div>
</body>
</html>
`

    await resend.emails.send({
        from: fromEmail,
        to: employeeEmail,
        subject: `✓ Unterschrift bestätigt - ${clientName} ${monthName} ${year}`,
        html: htmlContent,
    })
}

/**
 * Send reminder email to recipient (Assistenznehmer) after 2 days
 * NEW: Called by Vercel Cron job
 */
interface SendReminderEmailParams {
    recipientEmail: string
    recipientName: string
    sheetFileName: string
    month: number
    year: number
    signatureUrl: string
    expiresAt: Date
    employeeNames: string[]
    daysPending: number
}

export async function sendReminderEmail(params: SendReminderEmailParams) {
    const {
        recipientEmail,
        recipientName,
        sheetFileName,
        month,
        year,
        signatureUrl,
        expiresAt,
        employeeNames,
        daysPending
    } = params

    const resend = getResendClient()
    const fromEmail = process.env.EMAIL_FROM || "Dienstplan App <onboarding@resend.dev>"

    const monthName = MONTH_NAMES[month - 1]
    const expiresFormatted = expiresAt.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    })

    const employeeListHtml = employeeNames.map(name =>
        `<li style="padding: 3px 0;">${escapeHtml(name)}</li>`
    ).join("")

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">⏰ Erinnerung: Stundennachweis wartet auf Ihre Unterschrift</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${escapeHtml(sheetFileName)} - ${escapeHtml(monthName)} ${year}</p>
    </div>

    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">
            Hallo ${escapeHtml(recipientName || "")},
        </p>

        <p style="font-size: 15px; color: #4b5563;">
            Der Stundennachweis für <strong>${escapeHtml(monthName)} ${year}</strong> wartet seit <strong>${daysPending} Tagen</strong> auf Ihre Unterschrift.
        </p>

        <p style="font-size: 15px; color: #4b5563;">
            Folgende Mitarbeiter haben bereits unterschrieben:
        </p>

        <ul style="background: #f3f4f6; border-radius: 8px; padding: 15px 15px 15px 35px; margin: 20px 0; color: #374151;">
            ${employeeListHtml}
        </ul>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${escapeHtml(signatureUrl)}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(245, 158, 11, 0.3);">
                Jetzt unterschreiben
            </a>
        </div>

        <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>⚠️ Achtung:</strong> Dieser Link ist nur noch bis zum <strong>${escapeHtml(expiresFormatted)}</strong> gültig.
            </p>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">

        <p style="font-size: 13px; color: #6b7280;">
            Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br>
            <a href="${escapeHtml(signatureUrl)}" style="color: #f59e0b; word-break: break-all;">${escapeHtml(signatureUrl)}</a>
        </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
        <p>Diese E-Mail wurde automatisch von der Dienstplan App versendet.</p>
    </div>
</body>
</html>
`

    await resend.emails.send({
        from: fromEmail,
        to: recipientEmail,
        subject: `⏰ Erinnerung: Stundennachweis wartet - ${sheetFileName} ${monthName} ${year}`,
        html: htmlContent,
    })
}

/**
 * Send signature request email to employee
 * NEW: Employee can sign their timesheet via a token-based link
 */
interface SendEmployeeSignatureEmailParams {
    employeeEmail: string
    employeeName: string
    clientName: string
    sheetFileName: string
    month: number
    year: number
    signatureUrl: string
    expiresAt: Date
}

export async function sendEmployeeSignatureEmail(params: SendEmployeeSignatureEmailParams) {
    const {
        employeeEmail,
        employeeName,
        clientName,
        sheetFileName,
        month,
        year,
        signatureUrl,
        expiresAt
    } = params

    const resend = getResendClient()
    const fromEmail = process.env.EMAIL_FROM || "Dienstplan App <onboarding@resend.dev>"

    const monthName = MONTH_NAMES[month - 1]
    const expiresFormatted = expiresAt.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    })

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stundennachweis zur Unterschrift</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Stundennachweis zur Unterschrift</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${escapeHtml(sheetFileName)} - ${escapeHtml(monthName)} ${year}</p>
    </div>

    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">
            Hallo ${escapeHtml(employeeName)},
        </p>

        <p style="font-size: 15px; color: #4b5563;">
            Dein Stundennachweis für <strong>${escapeHtml(monthName)} ${year}</strong> bei <strong>${escapeHtml(clientName)}</strong> ist zur Unterschrift bereit.
        </p>

        <p style="font-size: 15px; color: #4b5563;">
            Bitte klicke auf den folgenden Button, um deine Stunden zu prüfen und zu unterschreiben:
        </p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${escapeHtml(signatureUrl)}" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(139, 92, 246, 0.3);">
                Jetzt unterschreiben
            </a>
        </div>

        <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>Hinweis:</strong> Dieser Link ist bis zum <strong>${escapeHtml(expiresFormatted)}</strong> gültig.
            </p>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">

        <p style="font-size: 13px; color: #6b7280;">
            Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>
            <a href="${escapeHtml(signatureUrl)}" style="color: #8b5cf6; word-break: break-all;">${escapeHtml(signatureUrl)}</a>
        </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
        <p>Diese E-Mail wurde automatisch von der Dienstplan App versendet.</p>
    </div>
</body>
</html>
`

    const textContent = `
Stundennachweis zur Unterschrift - ${sheetFileName} - ${monthName} ${year}

Hallo ${employeeName},

Dein Stundennachweis für ${monthName} ${year} bei ${clientName} ist zur Unterschrift bereit.

Bitte öffne den folgenden Link, um deine Stunden zu prüfen und zu unterschreiben:

${signatureUrl}

Hinweis: Dieser Link ist bis zum ${expiresFormatted} gültig.

Mit freundlichen Grüßen,
Dienstplan App
`

    await resend.emails.send({
        from: fromEmail,
        to: employeeEmail,
        subject: `Stundennachweis zur Unterschrift - ${sheetFileName} ${monthName} ${year}`,
        html: htmlContent,
    })
}

/**
 * Send invitation email to employee for self-registration
 */
interface SendInvitationEmailParams {
    employeeEmail: string
    employeeName: string
    registrationUrl: string
    expiresAt: Date
}

export async function sendInvitationEmail(params: SendInvitationEmailParams) {
    const { employeeEmail, employeeName, registrationUrl, expiresAt } = params

    const resend = getResendClient()
    const fromEmail = process.env.EMAIL_FROM || "Dienstplan App <onboarding@resend.dev>"

    const expiresFormatted = expiresAt.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    })

    const safeName = escapeHtml(employeeName)

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Einladung zur Dienstplan App</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Willkommen bei der Dienstplan App</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Dein Konto wurde erstellt</p>
    </div>

    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">
            Hallo ${safeName},
        </p>

        <p style="font-size: 15px; color: #4b5563;">
            Du wurdest zur <strong>Dienstplan App</strong> eingeladen. Um loszulegen, klicke bitte auf den Button unten und erstelle dein Passwort:
        </p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${registrationUrl}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
                Passwort erstellen
            </a>
        </div>

        <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>Hinweis:</strong> Dieser Link ist bis zum <strong>${expiresFormatted}</strong> gültig.
            </p>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">

        <p style="font-size: 13px; color: #6b7280;">
            Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>
            <a href="${registrationUrl}" style="color: #3b82f6; word-break: break-all;">${registrationUrl}</a>
        </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
        <p>Diese E-Mail wurde automatisch von der Dienstplan App versendet.</p>
    </div>
</body>
</html>
`

    const result = await resend.emails.send({
        from: fromEmail,
        to: employeeEmail,
        subject: `Einladung zur Dienstplan App - Bitte registriere dich`,
        html: htmlContent,
    })

    if (result.error) {
        console.error("[EMAIL] sendInvitationEmail failed:", result.error)
        throw new Error(result.error.message || "E-Mail konnte nicht gesendet werden")
    }

    return { success: true, id: result.data?.id }
}
