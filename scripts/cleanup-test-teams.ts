import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function cleanupTestTeams() {
    console.log('Cleaning up test teams...')

    const testTeamNames = ['Test Team', 'Test Team A', 'Test Team B']

    for (const name of testTeamNames) {
        const team = await prisma.team.findUnique({
            where: { name },
            include: {
                _count: {
                    select: { members: true, timesheets: true }
                }
            }
        })

        if (!team) {
            console.log(`Team "${name}" not found, skipping`)
            continue
        }

        if (team._count.members > 0) {
            console.log(`Moving ${team._count.members} members from "${name}" to null...`)
            await prisma.user.updateMany({
                where: { teamId: team.id },
                data: { teamId: null }
            })
        }

        console.log(`Deleting team "${name}"...`)
        await prisma.team.delete({ where: { id: team.id } })
        console.log(`✓ Deleted team "${name}"`)
    }

    console.log('\n✓ Cleanup complete!')
    console.log('Teams are now automatically created when employees are assigned to clients.')
}

cleanupTestTeams()
    .catch((e) => {
        console.error('Error during cleanup:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
