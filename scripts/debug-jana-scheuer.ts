import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function debugJanaScheuer() {
    console.log('🔍 Analysiere Jana Scheuer...\n')

    try {
        // 1. Suche Klient (auch inaktive)
        const clients = await prisma.client.findMany({
            where: {
                OR: [
                    { firstName: { contains: 'Jana', mode: 'insensitive' } },
                    { lastName: { contains: 'Scheuer', mode: 'insensitive' } }
                ]
            },
            include: {
                teams: {
                    include: {
                        members: {
                            select: { id: true, name: true }
                        },
                        timesheets: {
                            select: { id: true }
                        }
                    }
                },
                employees: {
                    select: { id: true, name: true }
                }
            }
        })

        console.log(`Gefundene Klienten: ${clients.length}\n`)

        clients.forEach(client => {
            console.log(`📋 Klient: ${client.firstName} ${client.lastName}`)
            console.log(`   ID: ${client.id}`)
            console.log(`   E-Mail: ${client.email || 'keine'}`)
            console.log(`   Status: ${client.isActive ? '✅ Aktiv' : '❌ Inaktiv'}`)
            console.log(`   Teams: ${client.teams.length}`)

            if (client.teams.length > 0) {
                client.teams.forEach(team => {
                    console.log(`     - ${team.name} (${team.members.length} Mitglieder, ${team.timesheets.length} Schichten)`)
                    if (team.members.length > 0) {
                        team.members.forEach(member => {
                            console.log(`       • ${member.name}`)
                        })
                    }
                })
            }

            console.log(`   Zugewiesene Mitarbeiter: ${client.employees.length}`)
            if (client.employees.length > 0) {
                client.employees.forEach(emp => {
                    console.log(`     - ${emp.name}`)
                })
            }
            console.log('')
        })

        // 2. Alle Teams mit "Jana" oder "Scheuer" im Namen
        console.log('\n🔍 Teams mit "Jana" oder "Scheuer" im Namen:\n')

        const teamsWithName = await prisma.team.findMany({
            where: {
                OR: [
                    { name: { contains: 'Jana', mode: 'insensitive' } },
                    { name: { contains: 'Scheuer', mode: 'insensitive' } }
                ]
            },
            include: {
                client: true,
                members: {
                    select: { id: true, name: true }
                }
            }
        })

        if (teamsWithName.length === 0) {
            console.log('Keine Teams gefunden!')
        } else {
            teamsWithName.forEach(team => {
                console.log(`Team: "${team.name}"`)
                console.log(`  Client ID: ${team.clientId}`)
                console.log(`  Client: ${team.client ? `${team.client.firstName} ${team.client.lastName} (${team.client.isActive ? 'aktiv' : 'inaktiv'})` : 'KEIN CLIENT'}`)
                console.log(`  Mitglieder: ${team.members.length}`)
                if (team.members.length > 0) {
                    team.members.forEach(m => console.log(`    - ${m.name}`))
                }
                console.log('')
            })
        }

    } catch (error) {
        console.error('❌ Fehler:', error)
        throw error
    } finally {
        await prisma.$disconnect()
    }
}

debugJanaScheuer()
    .catch(console.error)
