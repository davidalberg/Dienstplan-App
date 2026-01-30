import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const timesheets = await prisma.timesheet.findMany({
        where: {
            month: 1,
            year: 2026,
            sheetFileName: {
                contains: 'Jana_Scheuer'
            }
        },
        select: {
            id: true,
            date: true,
            status: true,
            sheetFileName: true
        },
        take: 5
    })

    console.log(`Found ${timesheets.length} timesheets:`)
    timesheets.forEach(ts => {
        console.log(`  ${ts.date.toISOString().split('T')[0]} - Status: ${ts.status} - Sheet: ${ts.sheetFileName}`)
    })
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
