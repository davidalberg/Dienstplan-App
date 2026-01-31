import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function cleanupOrphanedTeams() {
    console.log('🔍 Suche nach verwaisten Teams (Teams ohne Klient)...\n')

    try {
        // 1. Finde alle Teams ohne Klient (clientId ist null ODER Client existiert nicht mehr)
        const orphanedTeams = await prisma.team.findMany({
            where: {
                OR: [
                    { clientId: null },
                    {
                        client: null
                    }
                ]
            },
            include: {
                members: {
                    select: { id: true, name: true }
                },
                timesheets: {
                    select: { id: true }
                },
                submissions: {
                    select: { id: true }
                }
            }
        })

        if (orphanedTeams.length === 0) {
            console.log('✅ Keine verwaisten Teams gefunden!')
            return
        }

        console.log(`⚠️  ${orphanedTeams.length} verwaiste(s) Team(s) gefunden:\n`)

        orphanedTeams.forEach((team, index) => {
            console.log(`${index + 1}. Team: "${team.name}" (ID: ${team.id})`)
            console.log(`   - Mitglieder: ${team.members.length}`)
            console.log(`   - Schichten: ${team.timesheets.length}`)
            console.log(`   - Submissions: ${team.submissions.length}`)
            console.log(`   - Client ID: ${team.clientId || 'null'}`)
            console.log('')
        })

        // 2. Lösche Teams (CASCADE wird Timesheets/Submissions auch löschen wenn konfiguriert)
        console.log('🗑️  Lösche verwaiste Teams...\n')

        for (const team of orphanedTeams) {
            // Wichtig: Zuerst Mitarbeiter von Team trennen (teamId auf null setzen)
            if (team.members.length > 0) {
                console.log(`   Trenne ${team.members.length} Mitarbeiter von Team "${team.name}"`)
                await prisma.user.updateMany({
                    where: {
                        teamId: team.id
                    },
                    data: {
                        teamId: null
                    }
                })
            }

            // Team löschen
            console.log(`   Lösche Team "${team.name}" (${team.timesheets.length} Schichten, ${team.submissions.length} Submissions)`)
            await prisma.team.delete({
                where: { id: team.id }
            })
        }

        console.log(`\n✅ ${orphanedTeams.length} verwaiste(s) Team(s) erfolgreich gelöscht!`)

    } catch (error) {
        console.error('❌ Fehler beim Bereinigen:', error)
        throw error
    } finally {
        await prisma.$disconnect()
    }
}

cleanupOrphanedTeams()
    .catch((error) => {
        console.error('Fatal error:', error)
        process.exit(1)
    })
