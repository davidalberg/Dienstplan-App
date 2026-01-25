import nodemailer from "nodemailer"

const MONTH_NAMES = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

// Create reusable transporter
function getTransporter() {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
        throw new Error("Email configuration missing. Please set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD environment variables.")
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
        },
    })
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

    const transporter = getTransporter()
    const fromEmail = process.env.EMAIL_FROM || `"Dienstplan App" <${process.env.SMTP_USER}>`

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
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${monthName} ${year}</p>
    </div>

    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">
            Hallo ${recipientName || ""},
        </p>

        <p style="font-size: 15px; color: #4b5563;">
            <strong>${employeeName}</strong> hat seinen Stundennachweis für <strong>${monthName} ${year}</strong> eingereicht und wartet auf Ihre Gegenzeichnung.
        </p>

        <p style="font-size: 15px; color: #4b5563;">
            Bitte klicken Sie auf den folgenden Button, um den Nachweis zu prüfen und zu unterschreiben:
        </p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${signatureUrl}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
                Jetzt unterschreiben
            </a>
        </div>

        <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>⏰ Hinweis:</strong> Dieser Link ist bis zum <strong>${expiresFormatted}</strong> gültig.
            </p>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">

        <p style="font-size: 13px; color: #6b7280;">
            Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br>
            <a href="${signatureUrl}" style="color: #3b82f6; word-break: break-all;">${signatureUrl}</a>
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

Hallo ${recipientName || ""},

${employeeName} hat seinen Stundennachweis für ${monthName} ${year} eingereicht und wartet auf Ihre Gegenzeichnung.

Bitte öffnen Sie den folgenden Link, um den Nachweis zu prüfen und zu unterschreiben:

${signatureUrl}

Hinweis: Dieser Link ist bis zum ${expiresFormatted} gültig.

Mit freundlichen Grüßen,
Dienstplan App
`

    await transporter.sendMail({
        from: fromEmail,
        to: recipientEmail,
        subject: `Stundennachweis zur Unterschrift - ${employeeName} ${monthName} ${year}`,
        text: textContent,
        html: htmlContent,
    })
}

interface SendCompletionEmailParams {
    employeeEmail: string
    employeeName: string
    recipientEmail: string
    recipientName: string
    month: number
    year: number
    pdfUrl: string
    employeeSignedAt: Date
    recipientSignedAt: Date
    totalHours: number
}

export async function sendCompletionEmails(params: SendCompletionEmailParams) {
    const {
        employeeEmail,
        employeeName,
        recipientEmail,
        recipientName,
        month,
        year,
        pdfUrl,
        employeeSignedAt,
        recipientSignedAt,
        totalHours
    } = params

    const transporter = getTransporter()
    const fromEmail = process.env.EMAIL_FROM || `"Dienstplan App" <${process.env.SMTP_USER}>`

    const monthName = MONTH_NAMES[month - 1]

    const formatDate = (date: Date) => date.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    })

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
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${monthName} ${year}</p>
    </div>

    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; color: #4b5563;">
            Der Stundennachweis für <strong>${monthName} ${year}</strong> wurde von beiden Parteien unterschrieben und ist nun abgeschlossen.
        </p>

        <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="margin: 0 0 15px 0; font-size: 14px; color: #374151; text-transform: uppercase;">Zusammenfassung</h3>
            <table style="width: 100%; font-size: 14px;">
                <tr>
                    <td style="padding: 5px 0; color: #6b7280;">Mitarbeiter:</td>
                    <td style="padding: 5px 0; font-weight: 600;">${employeeName}</td>
                </tr>
                <tr>
                    <td style="padding: 5px 0; color: #6b7280;">Unterschrieben am:</td>
                    <td style="padding: 5px 0;">${formatDate(employeeSignedAt)}</td>
                </tr>
                <tr>
                    <td style="padding: 5px 0; color: #6b7280;">Assistenznehmer:</td>
                    <td style="padding: 5px 0; font-weight: 600;">${recipientName}</td>
                </tr>
                <tr>
                    <td style="padding: 5px 0; color: #6b7280;">Unterschrieben am:</td>
                    <td style="padding: 5px 0;">${formatDate(recipientSignedAt)}</td>
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
            <a href="${pdfUrl}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
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

Der Stundennachweis für ${monthName} ${year} wurde von beiden Parteien unterschrieben.

Zusammenfassung:
- Mitarbeiter: ${employeeName}, unterschrieben am ${formatDate(employeeSignedAt)}
- Assistenznehmer: ${recipientName}, unterschrieben am ${formatDate(recipientSignedAt)}
- Gesamtstunden: ${totalHours.toFixed(2)} Std.

PDF-Download: ${pdfUrl}

Mit freundlichen Grüßen,
Dienstplan App
`

    // Send to both parties
    const emailPromises = [
        transporter.sendMail({
            from: fromEmail,
            to: employeeEmail,
            subject: `✓ Stundennachweis abgeschlossen - ${monthName} ${year}`,
            text: textContent,
            html: htmlContent,
        }),
        transporter.sendMail({
            from: fromEmail,
            to: recipientEmail,
            subject: `✓ Stundennachweis abgeschlossen - ${employeeName} ${monthName} ${year}`,
            text: textContent,
            html: htmlContent,
        })
    ]

    await Promise.all(emailPromises)
}
