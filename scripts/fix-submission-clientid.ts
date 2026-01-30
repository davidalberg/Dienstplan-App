import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Fix: Setze clientId für TeamSubmissions die NULL haben
 */

async function fixSubmissionClientId() {
    console.log('Fixe TeamSubmissions ohne clientId...\n')

    // 1. Finde alle Submissions ohne clientId
    const submissions = await prisma.teamSubmission.findMany({
        where: {
            clientId: null
        },
        include: {
            employeeSignatures: {
                include: {
                    employee: {
                        include: {
                            team: {
                                include: {
                                    client: true
                                }
                            }
                        }
                    }
                }
            }
        }
    })

    console.log(`Gefunden: ${submissions.length} Submissions ohne clientId\n`)

    if (submissions.length === 0) {
        console.log('Keine Submissions zu fixen!\n')
        return
    }

    for (const sub of submissions) {
        console.log(`Submission: ${sub.sheetFileName}`)
        console.log(`  ID: ${sub.id}`)
        console.log(`  Status: ${sub.status}`)
        console.log(`  Mitarbeiter: ${sub.employeeSignatures.map(s => s.employee.name).join(', ')}`)

        // Ermittle clientId aus den Mitarbeitern
        const clientId = sub.employeeSignatures[0]?.employee?.team?.clientId

        if (clientId) {
            const clientName = sub.employeeSignatures[0]?.employee?.team?.client
            console.log(`  -> Setze clientId: ${clientName?.firstName} ${clientName?.lastName}`)

            await prisma.teamSubmission.update({
                where: { id: sub.id },
                data: { clientId: clientId }
            })

            console.log(`  ✓ Fixed!\n`)
        } else {
            console.log(`  ! Kann clientId nicht ermitteln (Mitarbeiter haben kein Team/Client)\n`)
        }
    }

    console.log('Fertig!\n')

    // Zeige Ergebnis
    const remainingBroken = await prisma.teamSubmission.count({
        where: { clientId: null }
    })

    console.log(`Submissions ohne clientId: ${remainingBroken}`)

    if (remainingBroken > 0) {
        console.log('! Noch Submissions ohne clientId - manuell pruefen!')
    } else {
        console.log('Alle Submissions haben jetzt einen clientId!')
    }
}

fixSubmissionClientId()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
