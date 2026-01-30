import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function debugTestVid() {
    console.log('🔍 Debugging TestVid...\n')

    // 1. Find TestVid
    const testvid = await prisma.user.findFirst({
        where: {
            OR: [
                { name: { contains: 'TestVid', mode: 'insensitive' } },
                { name: { contains: 'Testvid', mode: 'insensitive' } },
                { name: { contains: 'Test', mode: 'insensitive' } }
            ]
        },
        include: {
            team: {
                include: {
                    client: true
                }
            },
            clients: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true
                }
            }
        }
    })

    if (!testvid) {
        console.log('❌ TestVid nicht gefunden!')
        return
    }

    console.log('✅ TestVid gefunden:')
    console.log('   Name:', testvid.name)
    console.log('   Email:', testvid.email)
    console.log('   TeamId:', testvid.teamId || 'NULL ❌')
    console.log('\n📋 Clients (Many-to-Many):')
    testvid.clients.forEach(c => {
        console.log(`   - ${c.firstName} ${c.lastName} (ID: ${c.id})`)
    })

    if (testvid.team) {
        console.log('\n🏢 Primary Team:')
        console.log('   Name:', testvid.team.name)
        console.log('   ClientId:', testvid.team.clientId)
        if (testvid.team.client) {
            console.log('   Client:', `${testvid.team.client.firstName} ${testvid.team.client.lastName}`)
        }
    } else {
        console.log('\n❌ PROBLEM: TestVid hat KEIN Primary Team (teamId = NULL)')
    }

    // 2. Find Jana Scheuer
    const jana = await prisma.client.findFirst({
        where: {
            firstName: 'Jana',
            lastName: 'Scheuer'
        },
        include: {
            teams: {
                include: {
                    members: {
                        select: { id: true, name: true }
                    }
                }
            }
        }
    })

    if (jana) {
        console.log('\n👤 Jana Scheuer:')
        console.log('   ID:', jana.id)
        console.log('   Teams:', jana.teams.length)
        jana.teams.forEach(team => {
            console.log(`\n   Team: "${team.name}"`)
            console.log(`   Members: ${team.members.length}`)
            team.members.forEach(m => console.log(`     - ${m.name}`))
        })
    }

    // 3. Find all teams
    const allTeams = await prisma.team.findMany({
        include: {
            client: true,
            _count: {
                select: { members: true }
            }
        }
    })

    console.log('\n📊 Alle Teams in DB:')
    allTeams.forEach(team => {
        console.log(`   - "${team.name}" (Members: ${team._count.members}, Client: ${team.client?.firstName || 'NONE'})`)
    })

    await prisma.$disconnect()
}

debugTestVid().catch(console.error)
