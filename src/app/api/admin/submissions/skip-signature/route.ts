import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * POST /api/admin/submissions/skip-signature
 * Admin kann eine Mitarbeiter-Unterschrift ueberspringen (z.B. bei Urlaub, Krankheit)
 *
 * Body: { submissionId: string, employeeId: string }
 */
export async function POST(req: NextRequest) {
    const session = await auth()

    // Auth-Check: Nur Admins
    if (!session?.user || (session.user as any).role !== "ADMIN") {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        )
    }

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

        // Pruefe ob bereits unterschrieben
        if (empSig.signature) {
            return NextResponse.json(
                { error: "Mitarbeiter hat bereits unterschrieben" },
                { status: 400 }
            )
        }

        // Hole IP-Adresse des Admins
        const forwardedFor = req.headers.get("x-forwarded-for")
        const realIp = req.headers.get("x-real-ip")
        const adminIp = forwardedFor?.split(",")[0].trim() || realIp || "admin-skip"

        // Markiere als "uebersprungen" mit Dummy-Signatur
        await prisma.employeeSignature.update({
            where: { id: empSig.id },
            data: {
                signature: "SKIPPED_BY_ADMIN", // Marker fuer uebersprungene Unterschrift
                signedAt: new Date(),
                ipAddress: adminIp
            }
        })

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
