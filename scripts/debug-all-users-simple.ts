import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function debugAllUsers() {
    console.log('Analysiere alle User und ihre Team-Zuordnungen...\n')

    const users = await prisma.user.findMany({
        where: {
            role: {
                in: ['EMPLOYEE', 'TEAMLEAD']
            }
        },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            teamId: true,
            team: {
                select: {
                    id: true,
                    name: true,
                    clientId: true,
                    client: {
                        select: {
                            firstName: true,
                            lastName: true
                        }
                    }
                }
            },
            clients: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true
                }
            }
        },
        orderBy: {
            name: 'asc'
        }
    })

    console.log(`Gefunden: ${users.length} Mitarbeiter\n`)

    const withTeam = users.filter(u => u.teamId !== null)
    const withoutTeam = users.filter(u => u.teamId === null)

    console.log(`MIT PRIMARY TEAM: ${withTeam.length}`)
    console.log('----------------------------------------\n')

    withTeam.forEach(user => {
        console.log(`${user.name}`)
        console.log(`  Email: ${user.email}`)
        console.log(`  Primary Team: ${user.team?.name || 'UNKNOWN'}`)
        console.log(`  Team Client: ${user.team?.client ? `${user.team.client.firstName} ${user.team.client.lastName}` : 'KEINER'}`)

        if (user.clients.length > 0) {
            console.log(`  Zugewiesen zu Clients:`)
            user.clients.forEach(client => {
                console.log(`    - ${client.firstName} ${client.lastName}`)
            })
        }
        console.log('')
    })

    console.log(`OHNE PRIMARY TEAM: ${withoutTeam.length}`)
    console.log('----------------------------------------\n')

    if (withoutTeam.length > 0) {
        withoutTeam.forEach(user => {
            console.log(`${user.name}`)
            console.log(`  Email: ${user.email}`)
            console.log(`  Team ID: NULL`)

            if (user.clients.length > 0) {
                console.log(`  Zugewiesen zu Clients (aber kein Team!)`)
                user.clients.forEach(client => {
                    console.log(`    - ${client.firstName} ${client.lastName}`)
                })
            } else {
                console.log(`  KEINE Client-Zuordnung!`)
            }
            console.log('')
        })
    } else {
        console.log('  Alle Mitarbeiter haben ein Primary Team!\n')
    }

    // Inkonsistenz-Check
    console.log('INKONSISTENZ-CHECK:')
    console.log('----------------------------------------\n')

    let hasIssues = false

    const teamWithoutClient = withTeam.filter(u => u.team && !u.team.clientId)
    if (teamWithoutClient.length > 0) {
        hasIssues = true
        console.log(`${teamWithoutClient.length} Mitarbeiter mit Team ohne Client:`)
        teamWithoutClient.forEach(u => {
            console.log(`  - ${u.name} -> Team: ${u.team?.name}`)
        })
        console.log('')
    }

    const noTeamButClient = withoutTeam.filter(u => u.clients.length > 0)
    if (noTeamButClient.length > 0) {
        hasIssues = true
        console.log(`${noTeamButClient.length} Mitarbeiter ohne Team, aber mit Client:`)
        noTeamButClient.forEach(u => {
            console.log(`  - ${u.name} -> Clients: ${u.clients.map(c => `${c.firstName} ${c.lastName}`).join(', ')}`)
        })
        console.log('  Diese sollten ein Team haben!')
        console.log('')
    }

    const multiClientUsers = users.filter(u => u.clients.length > 1)
    if (multiClientUsers.length > 0) {
        console.log(`${multiClientUsers.length} Mitarbeiter in mehreren Clients:`)
        multiClientUsers.forEach(u => {
            console.log(`  - ${u.name}`)
            console.log(`    Primary Team: ${u.team?.name || 'NULL'}`)
            console.log(`    Clients: ${u.clients.map(c => `${c.firstName} ${c.lastName}`).join(', ')}`)
        })
        console.log('')
    }

    if (!hasIssues && withoutTeam.length === 0) {
        console.log('Keine Inkonsistenzen gefunden!\n')
    }

    // Summary
    console.log('ZUSAMMENFASSUNG:')
    console.log('----------------------------------------')
    console.log(`Total Mitarbeiter: ${users.length}`)
    console.log(`Mit Primary Team: ${withTeam.length}`)
    console.log(`Ohne Team: ${withoutTeam.length}`)
    console.log(`Multi-Client: ${multiClientUsers.length}`)

    if (noTeamButClient.length > 0) {
        console.log('\nAKTION ERFORDERLICH:')
        console.log(`  ${noTeamButClient.length} Mitarbeiter brauchen ein Team!`)
    }
}

debugAllUsers()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
