import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Debug Script: Zeigt alle Teams und Submissions für Jana Scheuer
 *
 * Verwendung:
 * npx tsx scripts/debug-jana-teams.ts
 */

async function debugJanaTeams() {
    console.log('🔍 Analysiere Teams für Jana Scheuer...\n')

    // 1. Finde Jana Scheuer Client
    const janaClient = await prisma.client.findFirst({
        where: {
            firstName: 'Jana',
            lastName: 'Scheuer'
        },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
        }
    })

    if (!janaClient) {
        console.log('❌ Jana Scheuer nicht in Datenbank gefunden!')
        return
    }

    console.log('✅ Client gefunden:')
    console.log(`   ID: ${janaClient.id}`)
    console.log(`   Name: ${janaClient.firstName} ${janaClient.lastName}`)
    console.log(`   Email: ${janaClient.email}\n`)

    // 2. Finde alle Teams für diesen Client
    const teams = await prisma.team.findMany({
        where: {
            clientId: janaClient.id
        },
        include: {
            members: {
                select: {
                    id: true,
                    name: true,
                    email: true
                }
            },
            _count: {
                select: {
                    members: true
                }
            }
        }
    })

    console.log(`📊 Anzahl Teams: ${teams.length}\n`)

    if (teams.length === 0) {
        console.log('⚠️  Keine Teams für Jana Scheuer gefunden!')
    } else {
        teams.forEach((team, index) => {
            console.log(`📋 Team ${index + 1}:`)
            console.log(`   ID: ${team.id}`)
            console.log(`   Name: ${team.name}`)
            console.log(`   Mitglieder-Anzahl: ${team._count.members}`)

            if (team.members.length > 0) {
                console.log(`   Mitglieder:`)
                team.members.forEach(member => {
                    console.log(`     - ${member.name} (${member.email})`)
                })
            } else {
                console.log(`   ⚠️  Keine Mitglieder in diesem Team!`)
            }
            console.log('')
        })
    }

    // 3. Finde alle Mitarbeiter, die Jana Scheuer zugewiesen sind (Many-to-Many)
    const clientWithEmployees = await prisma.client.findUnique({
        where: { id: janaClient.id },
        include: {
            employees: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    teamId: true,
                    team: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            }
        }
    })

    console.log('👥 Zugewiesene Assistenzkräfte (via clients.employees):')
    if (clientWithEmployees?.employees.length === 0) {
        console.log('   Keine Assistenzkräfte zugewiesen!\n')
    } else {
        clientWithEmployees?.employees.forEach(emp => {
            console.log(`   - ${emp.name}`)
            console.log(`     Email: ${emp.email}`)
            console.log(`     Team ID: ${emp.teamId || 'NULL'}`)
            console.log(`     Team Name: ${emp.team?.name || 'KEIN TEAM'}\n`)
        })
    }

    // 4. Finde TeamSubmissions für Januar 2026
    const submissions = await prisma.teamSubmission.findMany({
        where: {
            clientId: janaClient.id,
            month: 1,
            year: 2026
        },
        select: {
            id: true,
            sheetFileName: true,
            month: true,
            year: true,
            status: true,
            employeeSignatures: {
                select: {
                    employee: {
                        select: {
                            name: true
                        }
                    }
                }
            }
        }
    })

    console.log(`📄 TeamSubmissions für Januar 2026: ${submissions.length}\n`)

    if (submissions.length === 0) {
        console.log('   Keine Submissions für Januar 2026!\n')
    } else {
        submissions.forEach((sub, index) => {
            console.log(`   Submission ${index + 1}:`)
            console.log(`     ID: ${sub.id}`)
            console.log(`     SheetFileName: ${sub.sheetFileName}`)
            console.log(`     Status: ${sub.status}`)
            console.log(`     Mitarbeiter: ${sub.employeeSignatures.map(s => s.employee.name).join(', ')}\n`)
        })
    }

    // 5. Zusammenfassung
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 ZUSAMMENFASSUNG:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`Client: ${janaClient.firstName} ${janaClient.lastName}`)
    console.log(`Teams (via Team.clientId): ${teams.length}`)
    console.log(`Mitarbeiter (via Client.employees): ${clientWithEmployees?.employees.length || 0}`)
    console.log(`Submissions Januar 2026: ${submissions.length}`)

    if (teams.length > 1) {
        console.log('\n⚠️  PROBLEM: Mehrere Teams gefunden!')
        console.log('   → Ausführen: npx tsx scripts/cleanup-duplicate-teams.ts')
    } else if (teams.length === 0) {
        console.log('\n⚠️  PROBLEM: Keine Teams gefunden!')
        console.log('   → Mitarbeiter haben keine Team-Zuordnung')
    } else {
        console.log('\n✅ Sieht gut aus: Genau 1 Team vorhanden')
    }
}

debugJanaTeams()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
