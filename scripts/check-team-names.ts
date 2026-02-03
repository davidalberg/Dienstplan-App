import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkTeamNames() {
    console.log('🔍 Überprüfe Team-Namen...\n')

    try {
        const teams = await prisma.team.findMany({
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
            },
            orderBy: { name: 'asc' }
        })

        console.log(`📊 ${teams.length} Team(s) gefunden:\n`)
        console.log('='.repeat(80))

        teams.forEach((team, idx) => {
            const hasTeamPrefix = team.name.toLowerCase().startsWith('team ')
            const clientName = team.client
                ? `${team.client.firstName} ${team.client.lastName}`
                : 'KEIN CLIENT'

            console.log(`${idx + 1}. "${team.name}" ${hasTeamPrefix ? '⚠️  HAT "Team " PRÄFIX' : '✅'}`)
            console.log(`   Client: ${clientName}`)
            console.log(`   Generiertes sheetFileName: Team_${team.name.replace(/\s+/g, '_')}_2026`)

            if (hasTeamPrefix) {
                const correctedName = team.name.replace(/^Team\s+/i, '')
                console.log(`   💡 Korrigiert: ${correctedName}`)
                console.log(`   Korrigiertes sheetFileName: Team_${correctedName.replace(/\s+/g, '_')}_2026`)
            }
            console.log('')
        })

        console.log('='.repeat(80))
        console.log('\n⚠️  Teams mit "Team " Präfix sollten umbenannt werden!')
        console.log('   Beispiel: "Team Jana Scheuer" → "Jana Scheuer"')

    } catch (error) {
        console.error('❌ Fehler:', error)
        throw error
    } finally {
        await prisma.$disconnect()
    }
}

checkTeamNames()
    .catch((error) => {
        console.error('Fatal error:', error)
        process.exit(1)
    })
