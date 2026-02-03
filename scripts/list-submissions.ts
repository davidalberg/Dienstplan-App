import prisma from "../src/lib/prisma"

async function listSubmissions() {
    const subs = await prisma.teamSubmission.findMany({
        select: {
            id: true,
            sheetFileName: true,
            month: true,
            year: true,
            clientId: true,
            client: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true
                }
            }
        },
        orderBy: [
            { year: "desc" },
            { month: "desc" }
        ]
    })

    console.log("📋 All TeamSubmissions:\n")
    for (const sub of subs) {
        const clientName = sub.client ? `${sub.client.firstName} ${sub.client.lastName}` : "NULL"
        console.log(`Month: ${sub.month}/${sub.year}`)
        console.log(`Sheet: ${sub.sheetFileName}`)
        console.log(`ClientId: ${sub.clientId}`)
        console.log(`Client: ${clientName}`)
        console.log()
    }

    await prisma.$disconnect()
}

listSubmissions()
