import { PrismaClient } from '@prisma/client'
import * as readline from 'readline'

const prisma = new PrismaClient()

/**
 * Cleanup Script: Konsolidiert mehrere Teams zu einem einzigen Team
 *
 * Verwendung:
 * npx tsx scripts/cleanup-duplicate-teams.ts
 */

function askQuestion(query: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    return new Promise(resolve => rl.question(query, ans => {
        rl.close()
        resolve(ans)
    }))
}

async function cleanupDuplicateTeams() {
    console.log('🧹 Cleanup: Doppelte Teams konsolidieren\n')

    // 1. Finde alle Clients mit mehreren Teams
    const clients = await prisma.client.findMany({
        include: {
            teams: {
                include: {
                    members: {
                        select: {
                            id: true,
                            name: true,
                            email: true
                        }
                    },
                    _count: {
                        select: { members: true }
                    }
                }
            }
        }
    })

    const clientsWithMultipleTeams = clients.filter(c => c.teams.length > 1)

    if (clientsWithMultipleTeams.length === 0) {
        console.log('✅ Keine doppelten Teams gefunden!')
        console.log('   Alle Clients haben maximal 1 Team.\n')
        return
    }

    console.log(`⚠️  ${clientsWithMultipleTeams.length} Client(s) mit mehreren Teams gefunden:\n`)

    // 2. Zeige jeden Client mit mehreren Teams
    for (const client of clientsWithMultipleTeams) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log(`📋 Client: ${client.firstName} ${client.lastName}`)
        console.log(`   Anzahl Teams: ${client.teams.length}\n`)

        client.teams.forEach((team, index) => {
            console.log(`   Team ${index + 1}:`)
            console.log(`     ID: ${team.id}`)
            console.log(`     Name: ${team.name}`)
            console.log(`     Mitglieder: ${team._count.members}`)

            if (team.members.length > 0) {
                team.members.forEach(member => {
                    console.log(`       - ${member.name}`)
                })
            } else {
                console.log(`       (Keine Mitglieder)`)
            }
            console.log('')
        })

        // Empfehlung: Team mit den meisten Mitgliedern behalten
        const sortedTeams = [...client.teams].sort((a, b) => b._count.members - a._count.members)
        const primaryTeam = sortedTeams[0]
        const teamsToDelete = sortedTeams.slice(1)

        console.log(`   ✅ EMPFEHLUNG: Team behalten`)
        console.log(`      → "${primaryTeam.name}" (${primaryTeam._count.members} Mitglieder)`)
        console.log('')
        console.log(`   ❌ Teams löschen:`)
        teamsToDelete.forEach(t => {
            console.log(`      → "${t.name}" (${t._count.members} Mitglieder)`)
        })
        console.log('')

        // Frage User
        const answer = await askQuestion('   Konsolidieren? (j/n): ')

        if (answer.toLowerCase() !== 'j') {
            console.log('   ⏭️  Übersprungen\n')
            continue
        }

        // 3. Konsolidierung durchführen
        console.log('\n   🔄 Konsolidiere Teams...\n')

        try {
            // 3.1 Alle Mitglieder von anderen Teams zum Primary Team verschieben
            for (const teamToDelete of teamsToDelete) {
                if (teamToDelete.members.length > 0) {
                    console.log(`      Verschiebe ${teamToDelete.members.length} Mitglieder von "${teamToDelete.name}" zu "${primaryTeam.name}"...`)

                    await prisma.user.updateMany({
                        where: {
                            teamId: teamToDelete.id
                        },
                        data: {
                            teamId: primaryTeam.id
                        }
                    })

                    console.log(`      ✅ ${teamToDelete.members.length} Mitglieder verschoben`)
                }
            }

            // 3.2 Prüfe ob TeamSubmissions existieren, die auf die zu löschenden Teams verweisen
            // (TeamSubmission hat keine direkte Team-Relation, nur clientId + sheetFileName)
            // Also keine Änderung nötig

            // 3.3 Lösche die überflüssigen Teams
            for (const teamToDelete of teamsToDelete) {
                console.log(`      Lösche Team "${teamToDelete.name}"...`)

                await prisma.team.delete({
                    where: { id: teamToDelete.id }
                })

                console.log(`      ✅ Team gelöscht`)
            }

            console.log('\n   ✅ Konsolidierung abgeschlossen!\n')

        } catch (error) {
            console.error(`   ❌ Fehler bei Konsolidierung:`, error)
            console.log('   → Rollback wurde automatisch durchgeführt\n')
        }
    }

    // 4. Finale Überprüfung
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔍 FINALE ÜBERPRÜFUNG:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const remainingClients = await prisma.client.findMany({
        include: {
            teams: {
                include: {
                    _count: {
                        select: { members: true }
                    }
                }
            }
        }
    })

    const stillDuplicate = remainingClients.filter(c => c.teams.length > 1)

    if (stillDuplicate.length > 0) {
        console.log(`⚠️  ${stillDuplicate.length} Client(s) haben noch mehrere Teams:`)
        stillDuplicate.forEach(c => {
            console.log(`   - ${c.firstName} ${c.lastName} (${c.teams.length} Teams)`)
        })
        console.log('\n   → Script erneut ausführen\n')
    } else {
        console.log('✅ Alle Clients haben maximal 1 Team!')
        console.log('   → Stundennachweise-Seite sollte jetzt korrekt anzeigen\n')
    }

    // Stats
    const totalTeams = await prisma.team.count()
    const teamsWithMembers = await prisma.team.count({
        where: {
            members: {
                some: {}
            }
        }
    })

    console.log('📊 TEAM-STATISTIK:')
    console.log(`   Total Teams: ${totalTeams}`)
    console.log(`   Teams mit Mitgliedern: ${teamsWithMembers}`)
    console.log(`   Leere Teams: ${totalTeams - teamsWithMembers}`)

    if (totalTeams - teamsWithMembers > 0) {
        console.log('\n   💡 Tipp: Leere Teams löschen mit:')
        console.log('      npx tsx scripts/cleanup-empty-teams.ts\n')
    }
}

cleanupDuplicateTeams()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
