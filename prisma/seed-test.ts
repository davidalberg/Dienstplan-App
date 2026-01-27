import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

export async function seedTestData() {
    const hashedPassword = await bcrypt.hash('test123', 10)

    console.log('Cleaning up existing test data...')

    // Cleanup in correct order (foreign key constraints)
    await prisma.employeeSignature.deleteMany()
    await prisma.teamSubmission.deleteMany()
    await prisma.dienstplanConfig.deleteMany()
    await prisma.monthlySubmission.deleteMany()
    await prisma.auditLog.deleteMany()
    await prisma.timesheet.deleteMany()
    await prisma.user.deleteMany()
    await prisma.team.deleteMany()
    await prisma.syncLog.deleteMany()

    console.log('Creating test data...')

    // Create Team
    const team = await prisma.team.create({
        data: {
            name: 'Test Team',
            assistantRecipientEmail: 'assistenznehmer@test.de',
            assistantRecipientName: 'Test Assistenznehmer',
        },
    })
    console.log(`Created Team: ${team.name}`)

    // Create Admin User
    const admin = await prisma.user.create({
        data: {
            email: 'admin@test.de',
            name: 'Test Admin',
            password: hashedPassword,
            role: 'ADMIN',
        },
    })
    console.log(`Created Admin: ${admin.email}`)

    // Create Teamlead User
    const teamlead = await prisma.user.create({
        data: {
            email: 'teamlead@test.de',
            name: 'Test Teamlead',
            password: hashedPassword,
            role: 'TEAMLEAD',
            teamId: team.id,
        },
    })
    console.log(`Created Teamlead: ${teamlead.email}`)

    // Create Main Employee
    const employee = await prisma.user.create({
        data: {
            email: 'mitarbeiter@test.de',
            name: 'Max Mustermann',
            password: hashedPassword,
            role: 'EMPLOYEE',
            employeeId: 'EMP001',
            teamId: team.id,
            hourlyWage: 15.0,
            nightPremiumEnabled: true,
            nightPremiumPercent: 25,
            sundayPremiumEnabled: true,
            sundayPremiumPercent: 30,
            holidayPremiumEnabled: true,
            holidayPremiumPercent: 125,
        },
    })
    console.log(`Created Employee: ${employee.email}`)

    // Create Backup Employee
    const backupEmployee = await prisma.user.create({
        data: {
            email: 'backup@test.de',
            name: 'Backup Mitarbeiter',
            password: hashedPassword,
            role: 'EMPLOYEE',
            employeeId: 'EMP002',
            teamId: team.id,
            hourlyWage: 15.0,
        },
    })
    console.log(`Created Backup Employee: ${backupEmployee.email}`)

    // Current month for tests
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    console.log(`Creating shifts for ${month}/${year}...`)

    // Create 10 shifts for main employee (first 10 weekdays)
    let shiftsCreated = 0
    let currentDate = new Date(year, month - 1, 1)

    while (shiftsCreated < 10) {
        const dayOfWeek = currentDate.getDay()

        // Only create shifts on weekdays (Mon-Fri)
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            await prisma.timesheet.create({
                data: {
                    employeeId: employee.id,
                    date: new Date(currentDate),
                    plannedStart: '08:00',
                    plannedEnd: '16:00',
                    breakMinutes: 0, // No breaks in personal assistance
                    status: 'PLANNED',
                    month: month,
                    year: year,
                    teamId: team.id,
                    backupEmployeeId: backupEmployee.id,
                    sheetFileName: 'Test Dienstplan 2026',
                    source: 'Test Tab',
                },
            })
            shiftsCreated++
        }

        currentDate.setDate(currentDate.getDate() + 1)
    }
    console.log(`Created ${shiftsCreated} shifts for main employee`)

    // Create DienstplanConfig for submissions
    await prisma.dienstplanConfig.create({
        data: {
            sheetFileName: 'Test Dienstplan 2026',
            assistantRecipientEmail: 'assistenznehmer@test.de',
            assistantRecipientName: 'Test Assistenznehmer',
        },
    })
    console.log('Created DienstplanConfig')

    console.log('\n========================================')
    console.log('Test data seeded successfully!')
    console.log('========================================')
    console.log('\nTest Credentials:')
    console.log('  Admin:     admin@test.de / test123')
    console.log('  Teamlead:  teamlead@test.de / test123')
    console.log('  Employee:  mitarbeiter@test.de / test123')
    console.log('  Backup:    backup@test.de / test123')
    console.log('========================================\n')

    return {
        admin,
        teamlead,
        employee,
        backupEmployee,
        team,
        month,
        year,
    }
}

async function main() {
    try {
        await seedTestData()
    } catch (error) {
        console.error('Error seeding test data:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

main()
