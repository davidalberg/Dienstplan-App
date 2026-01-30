import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function findAllUsers() {
    const users = await prisma.user.findMany({
        where: {
            role: 'EMPLOYEE'
        },
        select: {
            id: true,
            name: true,
            email: true,
            employeeId: true,
            teamId: true,
            team: {
                select: {
                    name: true,
                    client: {
                        select: {
                            firstName: true,
                            lastName: true
                        }
                    }
                }
            },
            clients: {
                select: {
                    firstName: true,
                    lastName: true
                }
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    })

    console.log('👥 Alle Mitarbeiter:\n')
    users.forEach(user => {
        console.log(`📌 ${user.name} (${user.email})`)
        console.log(`   EmployeeId: ${user.employeeId || 'NONE'}`)
        console.log(`   TeamId: ${user.teamId || 'NULL ❌'}`)
        if (user.team) {
            console.log(`   Team: "${user.team.name}"`)
            if (user.team.client) {
                console.log(`   Team Client: ${user.team.client.firstName} ${user.team.client.lastName}`)
            }
        }
        console.log(`   Assigned Clients (Many-to-Many): ${user.clients.length}`)
        user.clients.forEach(c => {
            console.log(`     - ${c.firstName} ${c.lastName}`)
        })
        console.log()
    })

    await prisma.$disconnect()
}

findAllUsers().catch(console.error)
