import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function fixTeamNames() {
    console.log('🔧 Korrigiere Team-Namen...\n')

    try {
        const teams = await prisma.team.findMany()

        console.log(`📊 ${teams.length} Team(s) gefunden\n`)

        for (const team of teams) {
            const hasTeamPrefix = team.name.toLowerCase().startsWith('team ')

            if (hasTeamPrefix) {
                const correctedName = team.name.replace(/^Team\s+/i, '').trim()

                console.log(`🔧 Korrigiere: "${team.name}" → "${correctedName}"`)

                await prisma.team.update({
                    where: { id: team.id },
                    data: { name: correctedName }
                })

                console.log(`   ✅ Aktualisiert!`)
            } else {
                console.log(`✅ OK: "${team.name}"`)
            }
        }

        console.log('\n✨ Alle Team-Namen korrigiert!')

        // Show updated teams
        const updatedTeams = await prisma.team.findMany({
            select: { name: true },
            orderBy: { name: 'asc' }
        })

        console.log('\n📋 Aktualisierte Teams:')
        updatedTeams.forEach(t => console.log(`  - ${t.name}`))

    } catch (error) {
        console.error('❌ Fehler:', error)
        throw error
    } finally {
        await prisma.$disconnect()
    }
}

fixTeamNames()
    .catch((error) => {
        console.error('Fatal error:', error)
        process.exit(1)
    })
