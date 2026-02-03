import prisma from "../src/lib/prisma"

async function checkJanaEmployeeClients() {
    // Find timesheets for Jana Scheuer in January 2026
    const timesheets = await prisma.timesheet.findMany({
        where: {
            month: 1,
            year: 2026,
            sheetFileName: "Team_Jana_Scheuer_2026"
        },
        select: {
            id: true,
            employeeId: true,
            employee: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    clients: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true
                        }
                    }
                }
            }
        },
        take: 1
    })

    if (timesheets.length === 0) {
        console.log("❌ No timesheets found for Jana Scheuer January 2026")
        return
    }

    const employee = timesheets[0].employee
    if (!employee) {
        console.log("❌ Employee not found")
        return
    }

    console.log("📋 Employee Info:")
    console.log(`   ID: ${employee.id}`)
    console.log(`   Name: ${employee.name}`)
    console.log(`   Email: ${employee.email}`)
    console.log()
    console.log(`📋 Assigned Clients (${employee.clients.length}):`)
    console.log()

    for (const client of employee.clients) {
        console.log(`   - ${client.id} (${client.firstName} ${client.lastName})`)
    }

    if (employee.clients.length > 1) {
        console.log()
        console.log("🔴 PROBLEM: Employee has MULTIPLE clients assigned!")
        console.log("   The submissions API uses clients[0], which might be wrong.")
        console.log()
        console.log("   EXPECTED clientId: cml237k080000l4046fq4bak7")
        console.log(`   FIRST client[0]: ${employee.clients[0].id}`)
        if (employee.clients[0].id !== "cml237k080000l4046fq4bak7") {
            console.log()
            console.log("   ⚠️ THIS IS THE BUG! clients[0] has wrong ID!")
        }
    }

    await prisma.$disconnect()
}

checkJanaEmployeeClients()
