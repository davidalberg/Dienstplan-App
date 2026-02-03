import prisma from "../src/lib/prisma"

async function findJanaClient() {
    const clients = await prisma.client.findMany({
        where: {
            OR: [
                { firstName: { contains: "Jana" } },
                { lastName: { contains: "Scheuer" } }
            ]
        },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            teams: {
                select: {
                    id: true,
                    name: true
                }
            }
        }
    })

    console.log("📋 Jana Scheuer Clients Found:\n")
    console.log(JSON.stringify(clients, null, 2))

    await prisma.$disconnect()
}

findJanaClient()
