import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function fixTestVid() {
    console.log('🔧 Fixing TestVid...\n')

    // 1. Find Testvid
    const testvid = await prisma.user.findFirst({
        where: { name: 'Testvid' }
    })

    if (!testvid) {
        console.log('❌ Testvid nicht gefunden!')
        return
    }

    console.log('✅ Testvid gefunden:', testvid.id)

    // 2. Find Jana's team (the one with wrong name)
    const wrongTeam = await prisma.team.findFirst({
        where: {
            client: {
                firstName: 'Jana',
                lastName: 'Scheuer'
            }
        }
    })

    if (!wrongTeam) {
        console.log('❌ Team für Jana nicht gefunden!')
        return
    }

    console.log('📌 Gefundenes Team:', wrongTeam.name)

    // 3. Rename team to correct name
    console.log('\n🔄 Benenne Team um...')
    const renamedTeam = await prisma.team.update({
        where: { id: wrongTeam.id },
        data: {
            name: 'Team Jana Scheuer'
        }
    })
    console.log('✅ Team umbenannt zu:', renamedTeam.name)

    // 4. Set Testvid's primary team
    console.log('\n🔗 Setze Testvid\'s Primary Team...')
    await prisma.user.update({
        where: { id: testvid.id },
        data: {
            teamId: renamedTeam.id
        }
    })
    console.log('✅ Testvid.teamId gesetzt!')

    // 5. Verify
    const updated = await prisma.user.findUnique({
        where: { id: testvid.id },
        include: {
            team: {
                include: {
                    client: true
                }
            }
        }
    })

    console.log('\n✅ FERTIG! Verification:')
    console.log('   Testvid.teamId:', updated?.teamId)
    console.log('   Team Name:', updated?.team?.name)
    console.log('   Team Client:', updated?.team?.client?.firstName, updated?.team?.client?.lastName)

    await prisma.$disconnect()
}

fixTestVid().catch(console.error)
