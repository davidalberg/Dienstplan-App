import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function debugHeike() {
    console.log('Analysiere Heike Kruedenscheid...\n')

    // 1. Client suchen
    const client = await prisma.client.findFirst({
        where: {
            OR: [
                { firstName: 'Heike', lastName: { contains: 'Kr' } },
                { firstName: { contains: 'Heike' } }
            ]
        },
        include: {
            teams: {
                include: {
                    members: {
                        select: { name: true }
                    }
                }
            }
        }
    })

    if (!client) {
        console.log('Client nicht gefunden!')
        return
    }

    console.log(`Client: ${client.firstName} ${client.lastName}`)
    console.log(`  Teams: ${client.teams.length}`)
    if (client.teams.length > 0) {
        client.teams.forEach(team => {
            console.log(`    - ${team.name}: ${team.members.map(m => m.name).join(', ')}`)
        })
    }

    // 2. Timesheets (Schichten)
    const timesheets = await prisma.timesheet.findMany({
        where: {
            employee: {
                team: {
                    clientId: client.id
                }
            }
        },
        include: {
            employee: {
                select: { name: true }
            }
        },
        orderBy: { date: 'asc' }
    })

    console.log(`\n  Timesheets: ${timesheets.length}`)
    if (timesheets.length > 0) {
        timesheets.forEach(ts => {
            console.log(`    ${ts.employee.name} - ${ts.date.toISOString().split('T')[0]} (${ts.status})`)
        })
    }

    // 3. TeamSubmissions (Einreichungen)
    const submissions = await prisma.teamSubmission.findMany({
        where: {
            clientId: client.id
        }
    })

    console.log(`\n  Submissions: ${submissions.length}`)
    if (submissions.length === 0) {
        console.log('    KEINE SUBMISSIONS!')
        console.log('\n! Das ist der Grund!')
        console.log('  Stundennachweise-Seite zeigt nur SUBMISSIONS, nicht Timesheets.')
        console.log('\n  Loesung:')
        console.log('  1. Als Maria Witton einloggen')
        console.log('  2. Schichten bestaetigen')
        console.log('  3. "Mit Unterschrift einreichen"')
    } else {
        submissions.forEach(sub => {
            console.log(`    ${sub.sheetFileName} (${sub.status})`)
        })
    }
}

debugHeike()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
