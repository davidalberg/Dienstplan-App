/**
 * Email Templates for Reminder Emails
 *
 * Provides HTML and text templates for different reminder scenarios:
 * - BEFORE_DEADLINE: 3 days before month end
 * - OVERDUE_1: 1 day after month end
 * - OVERDUE_3: 3 days after month end (CC admin)
 */

const MONTH_NAMES = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

interface ReminderEmailData {
    employeeName: string
    month: number
    year: number
    unconfirmedCount: number
    daysUntilDeadline?: number
    daysOverdue?: number
    dashboardUrl: string
}

export type ReminderType = "BEFORE_DEADLINE" | "OVERDUE_1" | "OVERDUE_3"

/**
 * Get reminder email HTML template based on type
 */
export function getReminderEmailHTML(type: ReminderType, data: ReminderEmailData): string {
    const { employeeName, month, year, unconfirmedCount, daysUntilDeadline, daysOverdue, dashboardUrl } = data
    const monthName = MONTH_NAMES[month - 1]

    if (type === "BEFORE_DEADLINE") {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Erinnerung: Schichten bestätigen</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">⏰ Erinnerung: Schichten bestätigen</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${monthName} ${year}</p>
    </div>

    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">
            Hallo ${employeeName},
        </p>

        <p style="font-size: 15px; color: #4b5563;">
            Du hast noch <strong>${unconfirmedCount} unbestätigte Schicht${unconfirmedCount !== 1 ? 'en' : ''}</strong> für <strong>${monthName} ${year}</strong>.
        </p>

        <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>⏳ Deadline:</strong> Bitte bestätige deine Schichten innerhalb der nächsten <strong>${daysUntilDeadline} Tage</strong> (bis Monatsende).
            </p>
        </div>

        <p style="font-size: 15px; color: #4b5563;">
            Klicke auf den Button, um deine Schichten zu überprüfen und zu bestätigen:
        </p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(245, 158, 11, 0.3);">
                Schichten bestätigen
            </a>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">

        <p style="font-size: 13px; color: #6b7280;">
            Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>
            <a href="${dashboardUrl}" style="color: #f59e0b; word-break: break-all;">${dashboardUrl}</a>
        </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
        <p>Diese E-Mail wurde automatisch von der Dienstplan App versendet.</p>
    </div>
</body>
</html>
`
    }

    if (type === "OVERDUE_1") {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Überfällig: Schichten bestätigen</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">⚠️ Überfällig: Schichten bestätigen</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${monthName} ${year}</p>
    </div>

    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">
            Hallo ${employeeName},
        </p>

        <p style="font-size: 15px; color: #4b5563;">
            Die Frist zur Schicht-Bestätigung ist abgelaufen. Du hast noch <strong>${unconfirmedCount} unbestätigte Schicht${unconfirmedCount !== 1 ? 'en' : ''}</strong> für <strong>${monthName} ${year}</strong>.
        </p>

        <div style="background: #fee2e2; border: 1px solid #dc2626; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #991b1b; font-size: 14px;">
                <strong>❗ Überfällig:</strong> Die Deadline war gestern. Bitte bestätige deine Schichten so schnell wie möglich.
            </p>
        </div>

        <p style="font-size: 15px; color: #4b5563;">
            Klicke auf den Button, um deine Schichten zu überprüfen und zu bestätigen:
        </p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(220, 38, 38, 0.3);">
                Jetzt bestätigen
            </a>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">

        <p style="font-size: 13px; color: #6b7280;">
            Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>
            <a href="${dashboardUrl}" style="color: #dc2626; word-break: break-all;">${dashboardUrl}</a>
        </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
        <p>Diese E-Mail wurde automatisch von der Dienstplan App versendet.</p>
    </div>
</body>
</html>
`
    }

    // type === "OVERDUE_3"
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dringend: Schichten bestätigen</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #7c2d12 0%, #5c1f0e 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">🚨 DRINGEND: Schichten bestätigen</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${monthName} ${year}</p>
    </div>

    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">
            Hallo ${employeeName},
        </p>

        <p style="font-size: 15px; color: #4b5563;">
            Die Frist zur Schicht-Bestätigung ist seit <strong>${daysOverdue} Tagen</strong> überfällig. Du hast noch <strong>${unconfirmedCount} unbestätigte Schicht${unconfirmedCount !== 1 ? 'en' : ''}</strong> für <strong>${monthName} ${year}</strong>.
        </p>

        <div style="background: #fef2f2; border: 2px solid #7c2d12; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #7c2d12; font-size: 14px; font-weight: 600;">
                <strong>🚨 SOFORTIGES HANDELN ERFORDERLICH</strong>
            </p>
            <p style="margin: 10px 0 0 0; color: #5c1f0e; font-size: 13px;">
                Diese E-Mail wurde auch an die Administration weitergeleitet. Bitte bestätige deine Schichten umgehend, um Verzögerungen zu vermeiden.
            </p>
        </div>

        <p style="font-size: 15px; color: #4b5563;">
            Klicke auf den Button, um deine Schichten zu überprüfen und zu bestätigen:
        </p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #7c2d12 0%, #5c1f0e 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(124, 45, 18, 0.4);">
                Sofort bestätigen
            </a>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">

        <p style="font-size: 13px; color: #6b7280;">
            Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>
            <a href="${dashboardUrl}" style="color: #7c2d12; word-break: break-all;">${dashboardUrl}</a>
        </p>
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
    const { employeeName, month, year, unconfirmedCount, daysUntilDeadline, daysOverdue, dashboardUrl } = data
    const monthName = MONTH_NAMES[month - 1]

    if (type === "BEFORE_DEADLINE") {
        return `
Erinnerung: Schichten bestätigen - ${monthName} ${year}

Hallo ${employeeName},

Du hast noch ${unconfirmedCount} unbestätigte Schicht${unconfirmedCount !== 1 ? 'en' : ''} für ${monthName} ${year}.

Deadline: Bitte bestätige deine Schichten innerhalb der nächsten ${daysUntilDeadline} Tage (bis Monatsende).

Dashboard öffnen:
${dashboardUrl}

Mit freundlichen Grüßen,
Dienstplan App
`
    }

    if (type === "OVERDUE_1") {
        return `
ÜBERFÄLLIG: Schichten bestätigen - ${monthName} ${year}

Hallo ${employeeName},

Die Frist zur Schicht-Bestätigung ist abgelaufen. Du hast noch ${unconfirmedCount} unbestätigte Schicht${unconfirmedCount !== 1 ? 'en' : ''} für ${monthName} ${year}.

Bitte bestätige deine Schichten so schnell wie möglich.

Dashboard öffnen:
${dashboardUrl}

Mit freundlichen Grüßen,
Dienstplan App
`
    }

    // type === "OVERDUE_3"
    return `
DRINGEND: Schichten bestätigen - ${monthName} ${year}

Hallo ${employeeName},

Die Frist zur Schicht-Bestätigung ist seit ${daysOverdue} Tagen überfällig. Du hast noch ${unconfirmedCount} unbestätigte Schicht${unconfirmedCount !== 1 ? 'en' : ''} für ${monthName} ${year}.

SOFORTIGES HANDELN ERFORDERLICH: Diese E-Mail wurde auch an die Administration weitergeleitet.

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

    if (type === "BEFORE_DEADLINE") {
        return `⏰ Erinnerung: Schichten bestätigen - ${monthName} ${year}`
    }

    if (type === "OVERDUE_1") {
        return `⚠️ Überfällig: Schichten bestätigen - ${monthName} ${year}`
    }

    // type === "OVERDUE_3"
    return `🚨 DRINGEND: Schichten bestätigen - ${monthName} ${year}`
}
