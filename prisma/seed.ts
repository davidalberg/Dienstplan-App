import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Types als Strings, da sie nicht als Enums im Schema definiert sind
const Role = {
    ADMIN: 'ADMIN',
    TEAMLEAD: 'TEAMLEAD',
    EMPLOYEE: 'EMPLOYEE'
} as const

const Status = {
    PLANNED: 'PLANNED',
    CONFIRMED: 'CONFIRMED',
    CHANGED: 'CHANGED',
    SUBMITTED: 'SUBMITTED'
} as const

async function main() {
    const hashedPassword = await bcrypt.hash('password123', 10)

    // Keine Test-Teams mehr in Produktion
    // Teams werden automatisch bei Klient-Zuordnung erstellt

    // 1. Create Admin
    await prisma.user.upsert({
        where: { email: 'david.alberg@assistenzplus.de' },
        update: {},
        create: {
            email: 'david.alberg@assistenzplus.de',
            name: 'David Alberg',
            password: hashedPassword,
            role: Role.ADMIN,
        },
    })

    // 2. Create Teamlead (ohne Team - wird bei Klient-Zuordnung erstellt)
    await prisma.user.upsert({
        where: { email: 'personal@assistenzplus.de' },
        update: {},
        create: {
            email: 'personal@assistenzplus.de',
            name: 'Personal Abteilung',
            password: hashedPassword,
            role: Role.TEAMLEAD,
        },
    })

    // 3. Create Employees (ohne Team - wird bei Klient-Zuordnung erstellt)
    const employees = [
        { email: 'yusuf.agca@assistenzplus.de', name: 'Yusuf Agca', employeeId: 'EMP001' },
        { email: 'elena@assistenzplus.de', name: 'Elena Engagiert', employeeId: 'EMP002' },
        { email: 'stefan@assistenzplus.de', name: 'Stefan Süd', employeeId: 'EMP003' },
    ]

    for (const emp of employees) {
        const user = await prisma.user.upsert({
            where: { email: emp.email },
            update: {},
            create: {
                email: emp.email,
                name: emp.name,
                password: hashedPassword,
                role: Role.EMPLOYEE,
                employeeId: emp.employeeId,
            },
        })

        // Create some demo timesheets for the current month
        const now = new Date()
        const year = now.getFullYear()
        const month = now.getMonth() + 1

        // Create shifts for the first 5 days of the month
        for (let day = 1; day <= 5; day++) {
            const date = new Date(year, month - 1, day)
            await prisma.timesheet.upsert({
                where: {
                    employeeId_date: {
                        employeeId: user.id,
                        date: date,
                    }
                },
                update: {},
                create: {
                    employeeId: user.id,
                    date: date,
                    plannedStart: "08:00",
                    plannedEnd: "16:00",
                    breakMinutes: 30,
                    status: Status.PLANNED,
                    month: month,
                    year: year,
                    // teamId wird automatisch gesetzt wenn Mitarbeiter zu Klient zugeordnet wird
                }
            })
        }
    }

    console.log('Seed completed.')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
