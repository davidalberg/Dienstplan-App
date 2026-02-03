import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function testAPIClientId() {
    console.log('🧪 Teste API clientId für Jana Scheuer...\n')

    try {
        const targetMonth = 1
        const targetYear = 2026

        // Simulate what the API does
        const [allConfigs, allTeamsWithClients] = await Promise.all([
            prisma.dienstplanConfig.findMany({
                orderBy: { sheetFileName: "asc" }
            }),
            prisma.team.findMany({
                select: {
                    id: true,
                    name: true,
                    clientId: true,
                    client: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true
                        }
                    }
                }
            })
        ])

        console.log('📋 Gefundene Teams mit Clients:')
        allTeamsWithClients.forEach(team => {
            console.log(`  - ${team.name}`)
            console.log(`    Client ID: ${team.clientId || 'NONE'}`)
            if (team.client) {
                console.log(`    Client: ${team.client.firstName} ${team.client.lastName}`)
            }
        })
        console.log('')

        // Build team-client map
        const teamClientMap = new Map<string, any>()
        for (const team of allTeamsWithClients) {
            if (team.client) {
                const normalizedTeamName = team.name.toLowerCase().trim()
                teamClientMap.set(normalizedTeamName, team.client)
                console.log(`🗺️  Map Entry: "${normalizedTeamName}" -> ${team.client.firstName} ${team.client.lastName}`)
            }
        }
        console.log('')

        // Find Jana Scheuer configs
        const janaConfigs = allConfigs.filter(c =>
            c.sheetFileName.toLowerCase().includes('jana') &&
            c.sheetFileName.toLowerCase().includes('scheuer')
        )

        console.log('📄 Jana Scheuer DienstplanConfigs:')
        janaConfigs.forEach(config => {
            console.log(`  - ${config.sheetFileName}`)

            // Extract team name
            const teamName = extractTeamNameFromSheetFileName(config.sheetFileName)
            console.log(`    Extrahierter Team-Name: "${teamName}"`)

            if (teamName) {
                const normalizedTeamName = teamName.toLowerCase().trim()
                console.log(`    Normalisiert: "${normalizedTeamName}"`)

                const client = teamClientMap.get(normalizedTeamName)
                if (client) {
                    console.log(`    ✅ Client gefunden: ${client.firstName} ${client.lastName} (${client.id})`)
                } else {
                    console.log(`    ❌ KEIN Client gefunden in Map!`)
                    console.log(`    Verfügbare Keys:`, Array.from(teamClientMap.keys()))
                }
            } else {
                console.log(`    ❌ Konnte Team-Name nicht extrahieren!`)
            }
            console.log('')
        })

    } catch (error) {
        console.error('❌ Fehler:', error)
        throw error
    } finally {
        await prisma.$disconnect()
    }
}

// Copy of extractTeamNameFromSheetFileName from API
function extractTeamNameFromSheetFileName(sheetFileName: string): string | null {
    // Remove duplicate "Team_Team" prefix
    let cleaned = sheetFileName
    if (cleaned.startsWith("Team_Team_")) {
        cleaned = cleaned.replace("Team_Team_", "Team_")
    }

    // Replace underscores with spaces
    cleaned = cleaned.replace(/_/g, " ")

    // Remove year suffix (e.g., " 2026" or " 2026 2026")
    cleaned = cleaned.replace(/\s+\d{4}(\s+\d{4})?$/g, "")

    // Check if starts with "Team "
    if (cleaned.toLowerCase().startsWith("team ")) {
        return cleaned
    }

    return null
}

testAPIClientId()
    .catch((error) => {
        console.error('Fatal error:', error)
        process.exit(1)
    })
