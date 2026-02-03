/**
 * Email Templates for Reminder Emails
 *
 * NEUE REMINDER-LOGIK (basierend auf letztem Dienst):
 *
 * 1. LAST_SHIFT_DAY: Am Tag des letzten Dienstes
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
 */

const MONTH_NAMES = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

interface ShiftInfo {
    date: string  // z.B. "15.02.2026"
    time: string  // z.B. "08:00-16:00"
}

interface ReminderEmailData {
    employeeName: string
    month: number
    year: number
    unconfirmedCount: number
    daysUntilDeadline?: number
    daysOverdue?: number
    dashboardUrl: string
    shifts?: ShiftInfo[]
}

export type ReminderType = "LAST_SHIFT_DAY" | "DEADLINE" | "OVERDUE" | "URGENT"

/**
 * Helper: Render shift list HTML
 */
function renderShiftListHTML(shifts: ShiftInfo[] | undefined, maxShifts: number = 5): string {
    if (!shifts || shifts.length === 0) return ""

    const displayShifts = shifts.slice(0, maxShifts)
    const remaining = shifts.length - maxShifts

    let html = `<div style="background: #f3f4f6; border-radius: 8px; padding: 15px; margin: 15px 0;">
        <p style="margin: 0 0 10px 0; font-weight: 600; color: #374151; font-size: 14px;">Deine Schichten diesen Monat:</p>
        <ul style="margin: 0; padding-left: 20px; color: #4b5563; font-size: 14px;">`

    for (const shift of displayShifts) {
        html += `<li style="padding: 3px 0;">${shift.date} &bull; ${shift.time}</li>`
    }

    html += `</ul>`

    if (remaining > 0) {
        html += `<p style="margin: 10px 0 0 0; color: #6b7280; font-size: 13px;">+ ${remaining} weitere Schicht${remaining !== 1 ? 'en' : ''}</p>`
    }

    html += `</div>`
    return html
}

/**
 * Get reminder email HTML template based on type
 */
export function getReminderEmailHTML(type: ReminderType, data: ReminderEmailData): string {
    const { employeeName, month, year, unconfirmedCount, daysOverdue, dashboardUrl, shifts } = data
    const monthName = MONTH_NAMES[month - 1]
    const shiftListHTML = renderShiftListHTML(shifts)

    // =========================================================================
    // LAST_SHIFT_DAY: Am Tag des letzten Dienstes - Freundliche Info
    // =========================================================================
    if (type === "LAST_SHIFT_DAY") {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Letzter Dienst - Bitte unterschreiben</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">📋 Heute ist dein letzter Dienst</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${monthName} ${year}</p>
    </div>

    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">
            Hallo ${employeeName},
        </p>

        <p style="font-size: 15px; color: #4b5563;">
            heute ist dein letzter Dienst im <strong>${monthName}</strong>. Bitte unterschreibe deinen Stundennachweis <strong>nach Dienstende</strong>, damit wir die Abrechnung erstellen können.
        </p>

        ${shiftListHTML}

        <div style="background: #dbeafe; border: 1px solid #3b82f6; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #1e40af; font-size: 14px;">
                <strong>💡 So geht's:</strong> Klicke auf den Button, prüfe deine Stunden und unterschreibe digital.
            </p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
                Jetzt unterschreiben
            </a>
        </div>
    </div>

    <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
        <p>Diese E-Mail wurde automatisch von der Dienstplan App versendet.</p>
    </div>
</body>
</html>
`
    }

    // =========================================================================
    // DEADLINE: 2 Tage nach letztem Dienst - Freundliche Erinnerung
    // =========================================================================
    if (type === "DEADLINE") {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Erinnerung: Bitte unterschreiben</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">⏰ Erinnerung: Bitte unterschreiben</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${monthName} ${year}</p>
    </div>

    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">
            Hallo ${employeeName},
        </p>

        <p style="font-size: 15px; color: #4b5563;">
            dein letzter Dienst im <strong>${monthName}</strong> war vor 2 Tagen. Wir brauchen noch deine Unterschrift für den Stundennachweis.
        </p>

        ${shiftListHTML}

        <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>📝 Bitte unterschreibe heute</strong>, damit wir mit der Abrechnung fortfahren können.
            </p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(245, 158, 11, 0.3);">
                Jetzt unterschreiben
            </a>
        </div>
    </div>

    <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
        <p>Diese E-Mail wurde automatisch von der Dienstplan App versendet.</p>
    </div>
</body>
</html>
`
    }

    // =========================================================================
    // OVERDUE: Am 2. des Folgemonats - Dringende Aufforderung
    // =========================================================================
    if (type === "OVERDUE") {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dringende Aufforderung: Unterschrift fehlt</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">⚠️ Dringende Aufforderung</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${monthName} ${year} - Unterschrift fehlt</p>
    </div>

    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">
            Hallo ${employeeName},
        </p>

        <p style="font-size: 15px; color: #4b5563;">
            der Monat <strong>${monthName}</strong> ist vorbei und deine Unterschrift für den Stundennachweis fehlt noch.
        </p>

        <div style="background: #fee2e2; border: 1px solid #dc2626; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #991b1b; font-size: 14px;">
                <strong>❗ Wir brauchen deine Unterschrift bis heute Nachmittag.</strong><br>
                Ohne Unterschrift können wir die Abrechnung nicht abschließen.
            </p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(220, 38, 38, 0.3);">
                Sofort unterschreiben
            </a>
        </div>
    </div>

    <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
        <p>Diese E-Mail wurde automatisch von der Dienstplan App versendet.</p>
    </div>
</body>
</html>
`
    }

    // =========================================================================
    // URGENT: Am 4. des Folgemonats - Mit CC an Admin
    // =========================================================================
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DRINGEND: Unterschrift überfällig</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #7c2d12 0%, #5c1f0e 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">🚨 DRINGEND: Unterschrift überfällig</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${monthName} ${year}</p>
    </div>

    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">
            Hallo ${employeeName},
        </p>

        <p style="font-size: 15px; color: #4b5563;">
            deine Unterschrift für den Stundennachweis <strong>${monthName} ${year}</strong> ist jetzt <strong>${daysOverdue || 4} Tage überfällig</strong>.
        </p>

        <div style="background: #fef2f2; border: 2px solid #7c2d12; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #7c2d12; font-size: 14px; font-weight: 600;">
                🚨 SOFORTIGES HANDELN ERFORDERLICH
            </p>
            <p style="margin: 10px 0 0 0; color: #5c1f0e; font-size: 13px;">
                Diese E-Mail wurde auch an die <strong>Administration</strong> weitergeleitet.<br>
                Bitte unterschreibe <strong>umgehend</strong>, um Verzögerungen bei der Lohnabrechnung zu vermeiden.
            </p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #7c2d12 0%, #5c1f0e 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(124, 45, 18, 0.4);">
                JETZT UNTERSCHREIBEN
            </a>
        </div>
    </div>

    <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
        <p>Diese E-Mail wurde automatisch von der Dienstplan App versendet.</p>
    </div>
</body>
</html>
`
}

/**
 * Get reminder email text template (fallback for email clients without HTML support)
 */
export function getReminderEmailText(type: ReminderType, data: ReminderEmailData): string {
    const { employeeName, month, year, unconfirmedCount, daysOverdue, dashboardUrl, shifts } = data
    const monthName = MONTH_NAMES[month - 1]

    const shiftListText = shifts && shifts.length > 0
        ? "\n\nDeine Schichten:\n" + shifts.slice(0, 5).map(s => `- ${s.date}: ${s.time}`).join("\n") +
          (shifts.length > 5 ? `\n+ ${shifts.length - 5} weitere` : "")
        : ""

    if (type === "LAST_SHIFT_DAY") {
        return `
Heute ist dein letzter Dienst - ${monthName} ${year}

Hallo ${employeeName},

heute ist dein letzter Dienst im ${monthName}. Bitte unterschreibe deinen Stundennachweis nach Dienstende, damit wir die Abrechnung erstellen können.
${shiftListText}

Dashboard öffnen:
${dashboardUrl}

Mit freundlichen Grüßen,
Dienstplan App
`
    }

    if (type === "DEADLINE") {
        return `
Erinnerung: Bitte unterschreiben - ${monthName} ${year}

Hallo ${employeeName},

dein letzter Dienst im ${monthName} war vor 2 Tagen. Wir brauchen noch deine Unterschrift für den Stundennachweis.
${shiftListText}

Bitte unterschreibe heute, damit wir mit der Abrechnung fortfahren können.

Dashboard öffnen:
${dashboardUrl}

Mit freundlichen Grüßen,
Dienstplan App
`
    }

    if (type === "OVERDUE") {
        return `
DRINGENDE AUFFORDERUNG - ${monthName} ${year}

Hallo ${employeeName},

der Monat ${monthName} ist vorbei und deine Unterschrift für den Stundennachweis fehlt noch.

WIR BRAUCHEN DEINE UNTERSCHRIFT BIS HEUTE NACHMITTAG.
Ohne Unterschrift können wir die Abrechnung nicht abschließen.

Dashboard öffnen:
${dashboardUrl}

Mit freundlichen Grüßen,
Dienstplan App
`
    }

    // URGENT
    return `
🚨 DRINGEND: Unterschrift überfällig - ${monthName} ${year}

Hallo ${employeeName},

deine Unterschrift für den Stundennachweis ${monthName} ${year} ist jetzt ${daysOverdue || 4} Tage überfällig.

SOFORTIGES HANDELN ERFORDERLICH!
Diese E-Mail wurde auch an die Administration weitergeleitet.

Bitte unterschreibe umgehend, um Verzögerungen bei der Lohnabrechnung zu vermeiden.

Dashboard öffnen:
${dashboardUrl}

Mit freundlichen Grüßen,
Dienstplan App
`
}

/**
 * Get email subject based on reminder type
 */
export function getReminderEmailSubject(type: ReminderType, month: number, year: number): string {
    const monthName = MONTH_NAMES[month - 1]

    if (type === "LAST_SHIFT_DAY") {
        return `📋 ${monthName}: Letzter Dienst - Bitte unterschreiben`
    }

    if (type === "DEADLINE") {
        return `⏰ Erinnerung: Unterschrift ${monthName} ${year}`
    }

    if (type === "OVERDUE") {
        return `⚠️ Dringend: Unterschrift ${monthName} fehlt noch`
    }

    // URGENT
    return `🚨 DRINGEND: Unterschrift ${monthName} überfällig`
}
