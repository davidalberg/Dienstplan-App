import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function deleteInactiveJana() {
    console.log('🔍 Suche nach inaktiven Jana Scheuer Klienten...\n')

    try {
        // 1. Finde alle inaktiven "Jana Scheuer" Klienten
        const inactiveClients = await prisma.client.findMany({
            where: {
                OR: [
                    { firstName: { contains: 'Jana', mode: 'insensitive' } },
                    { lastName: { contains: 'Scheuer', mode: 'insensitive' } }
                ],
                isActive: false
            },
            include: {
                teams: {
                    include: {
                        members: {
                            select: { id: true, name: true }
                        },
                        timesheets: true,
                        submissions: true
                    }
                },
                employees: true
            }
        })

        if (inactiveClients.length === 0) {
            console.log('✅ Keine inaktiven Jana Scheuer Klienten gefunden!')
            return
        }

        console.log(`⚠️  ${inactiveClients.length} inaktive(n) Klient(en) gefunden:\n`)

        inactiveClients.forEach((client, index) => {
            console.log(`${index + 1}. ${client.firstName} ${client.lastName} (ID: ${client.id})`)
            console.log(`   - Status: ${client.isActive ? 'Aktiv' : 'Inaktiv'}`)
            console.log(`   - Teams: ${client.teams.length}`)
            console.log(`   - Zugewiesene Mitarbeiter: ${client.employees.length}`)

            if (client.teams.length > 0) {
                client.teams.forEach(team => {
                    console.log(`     • Team: "${team.name}"`)
                    console.log(`       - Mitglieder: ${team.members.length}`)
                    console.log(`       - Schichten: ${team.timesheets.length}`)
                    console.log(`       - Submissions: ${team.submissions.length}`)
                })
            }
            console.log('')
        })

        // 2. Für jeden Klienten: Teams und Klient löschen
        console.log('🗑️  Beginne mit permanentem Löschen...\n')

        for (const client of inactiveClients) {
            console.log(`Lösche Klient: ${client.firstName} ${client.lastName}`)

            // a) Trenne Mitarbeiter von allen Teams
            for (const team of client.teams) {
                if (team.members.length > 0) {
                    console.log(`  Trenne ${team.members.length} Mitarbeiter von Team "${team.name}"`)
                    await prisma.user.updateMany({
                        where: {
                            teamId: team.id
                        },
                        data: {
                            teamId: null
                        }
                    })
                }

                // b) Lösche Schichten des Teams
                if (team.timesheets.length > 0) {
                    console.log(`  Lösche ${team.timesheets.length} Schichten von Team "${team.name}"`)
                    await prisma.timesheet.deleteMany({
                        where: {
                            teamId: team.id
                        }
                    })
                }

                // c) Lösche Submissions des Teams
                if (team.submissions.length > 0) {
                    console.log(`  Lösche ${team.submissions.length} Submissions von Team "${team.name}"`)
                    await prisma.monthlySubmission.deleteMany({
                        where: {
                            teamId: team.id
                        }
                    })
                }

                // d) Team löschen
                console.log(`  Lösche Team "${team.name}"`)
                await prisma.team.delete({
                    where: { id: team.id }
                })
            }

            // e) Klient löschen (CASCADE wird automatisch restliche Relations löschen)
            console.log(`  Lösche Klient "${client.firstName} ${client.lastName}"`)
            await prisma.client.delete({
                where: { id: client.id }
            })

            console.log(`✅ Klient "${client.firstName} ${client.lastName}" erfolgreich gelöscht!\n`)
        }

        console.log(`\n✅ ${inactiveClients.length} inaktive(n) Klient(en) permanent gelöscht!`)

    } catch (error) {
        console.error('❌ Fehler beim Löschen:', error)
        throw error
    } finally {
        await prisma.$disconnect()
    }
}

deleteInactiveJana()
    .catch((error) => {
        console.error('Fatal error:', error)
        process.exit(1)
    })
