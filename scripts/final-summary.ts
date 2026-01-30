import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function finalSummary() {
    console.log('FINALES STATUS-SUMMARY')
    console.log('======================\n')

    // 1. Jana Scheuer Teams
    const janaClient = await prisma.client.findFirst({
        where: {
            firstName: 'Jana',
            lastName: 'Scheuer'
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

    console.log('JANA SCHEUER:')
    console.log(`  Client ID: ${janaClient?.id}`)
    console.log(`  Teams: ${janaClient?.teams.length || 0}`)

    if (janaClient?.teams && janaClient.teams.length > 0) {
        janaClient.teams.forEach((team, i) => {
            console.log(`    Team ${i + 1}: ${team.name}`)
            console.log(`      Mitglieder: ${team.members.map(m => m.name).join(', ')}`)
        })
    }

    // 2. Submissions Januar 2026
    const submissions = await prisma.teamSubmission.findMany({
        where: {
            month: 1,
            year: 2026,
            clientId: janaClient?.id
        },
        include: {
            client: true,
            employeeSignatures: {
                include: {
                    employee: {
                        select: { name: true }
                    }
                }
            }
        }
    })

    console.log(`\n  Submissions Januar 2026: ${submissions.length}`)

    submissions.forEach((sub, i) => {
        console.log(`    Submission ${i + 1}:`)
        console.log(`      SheetFileName: ${sub.sheetFileName}`)
        console.log(`      ClientId: ${sub.clientId ? 'GESETZT' : 'NULL'}`)
        console.log(`      Client Name: ${sub.client ? `${sub.client.firstName} ${sub.client.lastName}` : 'UNKNOWN'}`)
        console.log(`      Status: ${sub.status}`)
        console.log(`      Mitarbeiter: ${sub.employeeSignatures.map(s => s.employee.name).join(', ')}`)
        console.log(`      Signiert: ${sub.employeeSignatures.filter(s => s.signedAt).length}/${sub.employeeSignatures.length}`)
    })

    // 3. Timesheets Januar 2026
    const timesheets = await prisma.timesheet.findMany({
        where: {
            month: 1,
            year: 2026,
            employee: {
                teamId: janaClient?.teams[0]?.id
            }
        },
        select: {
            employee: {
                select: { name: true }
            },
            date: true,
            status: true
        }
    })

    console.log(`\n  Timesheets Januar 2026: ${timesheets.length}`)

    const byEmployee = new Map<string, number>()
    timesheets.forEach(ts => {
        const name = ts.employee.name
        byEmployee.set(name, (byEmployee.get(name) || 0) + 1)
    })

    byEmployee.forEach((count, name) => {
        console.log(`    ${name}: ${count} Schichten`)
    })

    // 4. Fazit
    console.log('\n' + '='.repeat(50))
    console.log('FAZIT:')
    console.log('='.repeat(50))

    if ((janaClient?.teams.length || 0) > 1) {
        console.log('\n! PROBLEM: Mehrere Teams fuer Jana Scheuer!')
        console.log('  -> Ausfuehren: npx tsx scripts/cleanup-duplicate-teams.ts')
    } else if ((janaClient?.teams.length || 0) === 1) {
        console.log('\n✓ Teams: OK (genau 1 Team)')
    } else {
        console.log('\n! PROBLEM: Kein Team fuer Jana Scheuer!')
    }

    if (submissions.length === 0) {
        console.log('! Submissions: KEINE fuer Januar 2026')
        console.log('  -> Mitarbeiter muessen Zeiten einreichen')
    } else if (submissions.every(s => s.clientId)) {
        console.log('✓ Submissions: Alle haben clientId')
    } else {
        console.log('! Submissions: Einige ohne clientId!')
        console.log('  -> Ausfuehren: npx tsx scripts/fix-submission-clientid.ts')
    }

    if (timesheets.length === 0) {
        console.log('! Timesheets: KEINE fuer Januar 2026')
        console.log('  -> Im Dienstplan-Editor Schichten erstellen')
    } else {
        console.log(`✓ Timesheets: ${timesheets.length} Schichten vorhanden`)
    }

    console.log('\nStundennachweise-Seite sollte jetzt korrekt anzeigen:')
    console.log(`  "${janaClient?.firstName} ${janaClient?.lastName}" -> ${submissions.length} Submission(s)`)
}

finalSummary()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
