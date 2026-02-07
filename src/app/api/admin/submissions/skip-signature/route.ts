import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import prisma from "@/lib/prisma"

/**
 * POST /api/admin/submissions/skip-signature
 * Admin kann eine Mitarbeiter-Unterschrift ueberspringen (z.B. bei Urlaub, Krankheit)
 *
 * Body: { submissionId: string, employeeId: string }
 */
export async function POST(req: NextRequest) {
    const result = await requireAdmin()
    if (result instanceof NextResponse) return result

    try {
        const { submissionId, employeeId } = await req.json()

        // Validierung der Eingaben
        if (!submissionId || !employeeId) {
            return NextResponse.json(
                { error: "submissionId und employeeId sind erforderlich" },
                { status: 400 }
            )
        }

        // Finde EmployeeSignature fuer diese Submission und diesen Mitarbeiter
        const empSig = await prisma.employeeSignature.findFirst({
            where: {
                teamSubmissionId: submissionId,
                employeeId
            },
            include: {
                employee: {
                    select: { name: true, email: true }
                }
            }
        })

        if (!empSig) {
            return NextResponse.json(
                { error: "Signature nicht gefunden" },
                { status: 404 }
            )
        }

        // Hole IP-Adresse des Admins
        const forwardedFor = req.headers.get("x-forwarded-for")
        const realIp = req.headers.get("x-real-ip")
        const adminIp = forwardedFor?.split(",")[0].trim() || realIp || "admin-skip"

        // ✅ FIX: Atomares Update NUR wenn signature noch null ist (Race Condition verhindert)
        // Verhindert, dass eine echte Signatur überschrieben wird
        const updateResult = await prisma.employeeSignature.updateMany({
            where: {
                id: empSig.id,
                signature: null // CRITICAL: Nur wenn noch nicht unterschrieben
            },
            data: {
                signature: "SKIPPED_BY_ADMIN", // Marker fuer uebersprungene Unterschrift
                signedAt: new Date(),
                ipAddress: adminIp
            }
        })

        // Prüfe ob Update erfolgreich war
        if (updateResult.count === 0) {
            return NextResponse.json(
                { error: "Mitarbeiter hat bereits unterschrieben (oder Unterschrift läuft gerade)" },
                { status: 409 }
            )
        }

        console.log(`[skip-signature] Signature uebersprungen fuer Employee ${employeeId} (${empSig.employee.name})`)

        // Pruefe ob jetzt ALLE unterschrieben haben
        const submission = await prisma.teamSubmission.findUnique({
            where: { id: submissionId },
            include: {
                employeeSignatures: true,
                dienstplanConfig: true
            }
        })

        if (!submission) {
            return NextResponse.json(
                { error: "Submission nicht gefunden" },
                { status: 404 }
            )
        }

        // Zaehle alle Unterschriften (inkl. der gerade uebersprungenen)
        const allSigned = submission.employeeSignatures.every(s => s.signature)

        let newStatus = submission.status

        if (allSigned && submission.status === "PENDING_EMPLOYEES") {
            // Update Status -> Assistenznehmer kann jetzt unterschreiben
            await prisma.teamSubmission.update({
                where: { id: submissionId },
                data: { status: "PENDING_RECIPIENT" }
            })

            newStatus = "PENDING_RECIPIENT"
            console.log(`[skip-signature] Alle Mitarbeiter haben unterschrieben (inkl. Skip) -> PENDING_RECIPIENT`)
        }

        return NextResponse.json({
            success: true,
            message: `Unterschrift fuer ${empSig.employee.name || "Mitarbeiter"} erfolgreich uebersprungen`,
            allSigned,
            newStatus,
            signedCount: submission.employeeSignatures.filter(s => s.signature).length,
            totalCount: submission.employeeSignatures.length
        })
    } catch (error: any) {
        console.error("[skip-signature] Error:", error)
        return NextResponse.json(
            { error: "Interner Serverfehler beim Ueberspringen der Unterschrift" },
            { status: 500 }
        )
    }
}
