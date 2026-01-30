import { PrismaClient } from '@prisma/client'
import * as readline from 'readline'

const prisma = new PrismaClient()

/**
 * Cleanup Script: Löscht Teams ohne Mitglieder
 *
 * Verwendung:
 * npx tsx scripts/cleanup-empty-teams.ts
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

async function cleanupEmptyTeams() {
    console.log('🧹 Cleanup: Leere Teams löschen\n')

    // Finde alle Teams ohne Mitglieder
    const emptyTeams = await prisma.team.findMany({
        where: {
            members: {
                none: {}
            }
        },
        include: {
            client: {
                select: {
                    firstName: true,
                    lastName: true
                }
            }
        }
    })

    if (emptyTeams.length === 0) {
        console.log('✅ Keine leeren Teams gefunden!\n')
        return
    }

    console.log(`⚠️  ${emptyTeams.length} leere Team(s) gefunden:\n`)

    emptyTeams.forEach((team, index) => {
        console.log(`   ${index + 1}. "${team.name}"`)
        console.log(`      ID: ${team.id}`)
        console.log(`      Client: ${team.client ? `${team.client.firstName} ${team.client.lastName}` : 'KEINER'}`)
        console.log('')
    })

    const answer = await askQuestion('Alle leeren Teams löschen? (j/n): ')

    if (answer.toLowerCase() !== 'j') {
        console.log('\n⏭️  Abgebrochen\n')
        return
    }

    console.log('\n🔄 Lösche leere Teams...\n')

    try {
        const result = await prisma.team.deleteMany({
            where: {
                members: {
                    none: {}
                }
            }
        })

        console.log(`✅ ${result.count} Team(s) gelöscht!\n`)

        // Finale Stats
        const remainingTeams = await prisma.team.count()
        const teamsWithMembers = await prisma.team.count({
            where: {
                members: {
                    some: {}
                }
            }
        })

        console.log('📊 TEAM-STATISTIK:')
        console.log(`   Total Teams: ${remainingTeams}`)
        console.log(`   Teams mit Mitgliedern: ${teamsWithMembers}`)
        console.log(`   Leere Teams: ${remainingTeams - teamsWithMembers}\n`)

    } catch (error) {
        console.error('❌ Fehler beim Löschen:', error)
    }
}

cleanupEmptyTeams()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
