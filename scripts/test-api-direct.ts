import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Copy of extractTeamNameFromSheetFileName from API
function extractTeamNameFromSheetFileName(sheetFileName: string): string | null {
    let cleaned = sheetFileName
    if (cleaned.startsWith("Team_Team_")) {
        cleaned = cleaned.replace("Team_Team_", "Team_")
    }
    cleaned = cleaned.replace(/_/g, " ")
    cleaned = cleaned.replace(/\s+\d{4}(\s+\d{4})?$/g, "")
    if (cleaned.toLowerCase().startsWith("team ")) {
        return cleaned
    }
    return null
}

async function testAPIDirect() {
    console.log('🧪 Teste API-Logik direkt (Januar 2026)...\n')

    try {
        const targetMonth = 1
        const targetYear = 2026

        // Load data (simplified version of API)
        const [teamSubmissions, allConfigs, allTeamsWithClients] = await Promise.all([
            prisma.teamSubmission.findMany({
                where: {
                    month: targetMonth,
                    year: targetYear
                },
                include: {
                    client: true
                }
            }),
            prisma.dienstplanConfig.findMany(),
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

        console.log(`📊 TeamSubmissions (${targetMonth}/${targetYear}): ${teamSubmissions.length}`)
        console.log(`📄 DienstplanConfigs: ${allConfigs.length}`)
        console.log(`👥 Teams mit Clients: ${allTeamsWithClients.length}\n`)

        // Build team-client map
        const teamClientMap = new Map<string, any>()
        for (const team of allTeamsWithClients) {
            if (team.client) {
                const normalizedTeamName = team.name.toLowerCase().trim()
                teamClientMap.set(normalizedTeamName, team.client)
            }
        }

        console.log('🗺️  Team-Client Map:')
        for (const [key, client] of teamClientMap.entries()) {
            console.log(`  "${key}" -> ${client.firstName} ${client.lastName} (${client.id})`)
        }
        console.log('')

        // Find submitted sheet file names
        const submittedSheetFileNames = new Set(
            teamSubmissions.map(s => s.sheetFileName)
        )

        // Build pending dienstplaene
        const pendingDienstplaene = allConfigs
            .filter(config => !submittedSheetFileNames.has(config.sheetFileName))
            .map((config) => {
                // Extract team name and find client
                const teamName = extractTeamNameFromSheetFileName(config.sheetFileName)
                let client = null

                if (teamName) {
                    const normalizedTeamName = teamName.toLowerCase().trim()
                    client = teamClientMap.get(normalizedTeamName) || null
                }

                return {
                    id: null,
                    sheetFileName: config.sheetFileName,
                    month: targetMonth,
                    year: targetYear,
                    status: "NOT_STARTED",
                    recipientEmail: config.assistantRecipientEmail,
                    recipientName: config.assistantRecipientName,
                    client: client ? {
                        id: client.id,
                        firstName: client.firstName,
                        lastName: client.lastName,
                        email: client.email
                    } : null,
                    clientId: client?.id || null
                }
            })

        console.log('📋 Pending Dienstpläne (NOT_STARTED):')
        console.log('='.repeat(80))
        pendingDienstplaene.forEach((pd, idx) => {
            console.log(`\n${idx + 1}. ${pd.sheetFileName}`)
            console.log(`   Status: ${pd.status}`)
            console.log(`   Recipient: ${pd.recipientName}`)
            console.log(`   Client ID: ${pd.clientId || '❌ FEHLT!'}`)
            if (pd.client) {
                console.log(`   Client: ${pd.client.firstName} ${pd.client.lastName}`)
            }

            if (pd.sheetFileName.toLowerCase().includes('jana') &&
                pd.sheetFileName.toLowerCase().includes('scheuer')) {
                console.log('   🎯 ← JANA SCHEUER')
            }
        })
        console.log('\n' + '='.repeat(80))

        // Check Jana Scheuer specifically
        const janaSubmission = pendingDienstplaene.find(pd =>
            pd.sheetFileName.toLowerCase().includes('jana') &&
            pd.sheetFileName.toLowerCase().includes('scheuer')
        )

        if (janaSubmission) {
            console.log('\n✅ ERGEBNIS für Jana Scheuer:')
            console.log('='.repeat(80))
            console.log('sheetFileName:', janaSubmission.sheetFileName)
            console.log('clientId:', janaSubmission.clientId || '❌ FEHLT!')
            console.log('client:', janaSubmission.client)
            console.log('='.repeat(80))

            if (janaSubmission.clientId) {
                console.log('\n✅ SUCCESS: Jana Scheuer hat eine clientId!')
                console.log('Die API sollte diese korrekt zurückgeben.')
            } else {
                console.log('\n❌ PROBLEM: Jana Scheuer hat KEINE clientId!')
                console.log('Das ist der Grund für den Fehler.')
            }
        } else {
            console.log('\n⚠️  Keine Jana Scheuer Submission gefunden in pending Dienstplänen')
        }

    } catch (error) {
        console.error('❌ Fehler:', error)
        throw error
    } finally {
        await prisma.$disconnect()
    }
}

testAPIDirect()
    .catch((error) => {
        console.error('Fatal error:', error)
        process.exit(1)
    })
