import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function deleteJanaSubmission() {
    console.log('🔍 Suche nach "Team Jana Scheuer" Submissions...\n')

    try {
        // Finde alle Submissions für "Team Jana Scheuer"
        const submissions = await prisma.teamSubmission.findMany({
            where: {
                OR: [
                    { sheetFileName: { contains: 'Jana', mode: 'insensitive' } },
                    { sheetFileName: { contains: 'Scheuer', mode: 'insensitive' } }
                ]
            },
            include: {
                employeeSignatures: true,
                client: true
            }
        })

        if (submissions.length === 0) {
            console.log('✅ Keine "Jana Scheuer" Submissions gefunden!')
            return
        }

        console.log(`⚠️  ${submissions.length} Submission(s) gefunden:\n`)

        submissions.forEach((sub, index) => {
            console.log(`${index + 1}. sheetFileName: "${sub.sheetFileName}"`)
            console.log(`   ID: ${sub.id}`)
            console.log(`   Status: ${sub.status}`)
            console.log(`   Month/Year: ${sub.month}/${sub.year}`)
            console.log(`   Client: ${sub.client ? `${sub.client.firstName} ${sub.client.lastName}` : 'KEIN CLIENT'}`)
            console.log(`   Employee Signatures: ${sub.employeeSignatures.length}`)
            console.log('')
        })

        // Lösche alle gefundenen Submissions
        console.log('🗑️  Lösche Submissions...\n')

        for (const sub of submissions) {
            // Employee Signatures werden automatisch gelöscht (onDelete: Cascade)
            console.log(`  Lösche Submission: "${sub.sheetFileName}"`)
            await prisma.teamSubmission.delete({
                where: { id: sub.id }
            })
        }

        console.log(`\n✅ ${submissions.length} Submission(s) erfolgreich gelöscht!`)

    } catch (error) {
        console.error('❌ Fehler:', error)
        throw error
    } finally {
        await prisma.$disconnect()
    }
}

deleteJanaSubmission()
    .catch(console.error)
