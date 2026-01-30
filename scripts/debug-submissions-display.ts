import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Debug: Was sieht die Stundennachweise-Seite für Januar 2026?
 */

async function debugSubmissionsDisplay() {
    const month = 1
    const year = 2026

    console.log(`Analysiere Submissions-Anzeige für ${month}/${year}...\n`)

    // 1. Alle TeamSubmissions für diesen Monat
    const submissions = await prisma.teamSubmission.findMany({
        where: {
            month,
            year
        },
        include: {
            client: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true
                }
            },
            employeeSignatures: {
                include: {
                    employee: {
                        select: {
                            name: true
                        }
                    }
                }
            }
        }
    })

    console.log(`TeamSubmissions gefunden: ${submissions.length}\n`)

    if (submissions.length === 0) {
        console.log('KEINE SUBMISSIONS!\n')
        console.log('Das erklaert warum nichts angezeigt wird.\n')
    } else {
        submissions.forEach((sub, index) => {
            console.log(`Submission ${index + 1}:`)
            console.log(`  ID: ${sub.id}`)
            console.log(`  SheetFileName: ${sub.sheetFileName}`)
            console.log(`  Client: ${sub.client ? `${sub.client.firstName} ${sub.client.lastName}` : 'UNKNOWN'}`)
            console.log(`  Status: ${sub.status}`)
            console.log(`  Mitarbeiter: ${sub.employeeSignatures.map(s => s.employee.name).join(', ')}`)
            console.log('')
        })
    }

    // 2. Alle DienstplanConfigs (pending Dienstplaene)
    const configs = await prisma.dienstplanConfig.findMany({
        where: {
            active: true
        },
        include: {
            team: {
                include: {
                    client: {
                        select: {
                            firstName: true,
                            lastName: true
                        }
                    },
                    members: {
                        select: {
                            name: true
                        }
                    }
                }
            }
        }
    })

    console.log(`DienstplanConfigs (aktiv): ${configs.length}\n`)

    if (configs.length > 0) {
        configs.forEach((config, index) => {
            console.log(`Config ${index + 1}:`)
            console.log(`  ID: ${config.id}`)
            console.log(`  SheetFileName: ${config.sheetFileName}`)
            console.log(`  Team: ${config.team?.name || 'UNKNOWN'}`)
            console.log(`  Client: ${config.team?.client ? `${config.team.client.firstName} ${config.team.client.lastName}` : 'UNKNOWN'}`)
            console.log(`  Mitglieder: ${config.team?.members.map(m => m.name).join(', ') || 'KEINE'}`)
            console.log('')
        })
    }

    // 3. Gruppierung wie auf der Seite
    console.log('GRUPPIERUNG NACH CLIENT:')
    console.log('----------------------------------------\n')

    // Kombiniere Submissions + pending Configs
    const allItems = [
        ...submissions.map(s => ({
            type: 'submission' as const,
            clientId: s.clientId || s.client?.id || 'unknown',
            clientName: s.client ? `${s.client.firstName} ${s.client.lastName}` : 'Unknown',
            sheetFileName: s.sheetFileName,
            status: s.status,
            employeeNames: s.employeeSignatures.map(sig => sig.employee.name)
        })),
        ...configs.map(c => ({
            type: 'config' as const,
            clientId: c.team?.clientId || 'unknown',
            clientName: c.team?.client ? `${c.team.client.firstName} ${c.team.client.lastName}` : 'Unknown',
            sheetFileName: c.sheetFileName,
            status: 'NOT_STARTED' as const,
            employeeNames: c.team?.members.map(m => m.name) || []
        }))
    ]

    // Gruppiere nach clientId
    const grouped = new Map<string, typeof allItems>()

    allItems.forEach(item => {
        const existing = grouped.get(item.clientId) || []
        existing.push(item)
        grouped.set(item.clientId, existing)
    })

    grouped.forEach((items, clientId) => {
        console.log(`Client: ${items[0].clientName}`)
        console.log(`  Anzahl Items: ${items.length}`)
        console.log(`  Items:`)
        items.forEach((item, index) => {
            console.log(`    ${index + 1}. ${item.type === 'submission' ? 'Submission' : 'Config'}: ${item.sheetFileName}`)
            console.log(`       Status: ${item.status}`)
            console.log(`       Mitarbeiter: ${item.employeeNames.join(', ')}`)
        })
        console.log('')
    })

    // 4. Fazit
    console.log('FAZIT:')
    console.log('----------------------------------------')
    console.log(`Total Submissions: ${submissions.length}`)
    console.log(`Total Configs: ${configs.length}`)
    console.log(`Eindeutige Clients: ${grouped.size}`)

    grouped.forEach((items, clientId) => {
        if (items.length > 1) {
            console.log(`\n! Client "${items[0].clientName}" hat ${items.length} Items (Submissions/Configs)`)
            console.log('  -> Das wird als "X Teams" angezeigt!')
        }
    })
}

debugSubmissionsDisplay()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
