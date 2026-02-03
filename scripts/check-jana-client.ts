import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
})

async function diagnoseJanaClient() {
  console.log('='.repeat(80))
  console.log('DIAGNOSTIC SCRIPT: Jana Scheuer Client Relationship')
  console.log('='.repeat(80))
  console.log('')

  try {
    // 1. Find Jana Scheuer as a client
    console.log('1. CHECKING JANA SCHEUER AS CLIENT')
    console.log('-'.repeat(80))
    const janaClient = await prisma.client.findFirst({
      where: {
        OR: [
          { firstName: { contains: 'Jana', mode: 'insensitive' } },
          { lastName: { contains: 'Scheuer', mode: 'insensitive' } },
        ]
      },
      include: {
        teams: {
          include: {
            members: true,
          }
        },
        submissions: true, // TeamSubmissions for this client
      }
    })

    if (janaClient) {
      console.log('✅ Found Jana Scheuer client:')
      console.log(`   ID: ${janaClient.id}`)
      console.log(`   Name: ${janaClient.firstName} ${janaClient.lastName}`)
      console.log(`   Email: ${janaClient.email}`)
      console.log(`   Teams count: ${janaClient.teams.length}`)
      console.log(`   Submissions count: ${janaClient.submissions.length}`)
      console.log('')

      if (janaClient.teams.length > 0) {
        console.log('   Teams:')
        janaClient.teams.forEach(team => {
          console.log(`     - Team ID: ${team.id}, Name: ${team.name}, Members: ${team.members.length}`)
          team.members.forEach(member => {
            console.log(`       * ${member.name} (${member.email})`)
          })
        })
      }
      console.log('')

      if (janaClient.submissions.length > 0) {
        console.log('   TeamSubmissions directly linked to client:')
        janaClient.submissions.forEach(sub => {
          console.log(`     - Submission ID: ${sub.id}, Month: ${sub.month}/${sub.year}, Status: ${sub.status}`)
        })
      }
    } else {
      console.log('❌ No client found matching "Jana Scheuer"')
    }
    console.log('')

    // 1b. Check DienstplanConfigs mentioning Jana
    console.log('1b. CHECKING DIENSTPLANCONFIGS FOR JANA')
    console.log('-'.repeat(80))
    const janaConfigs = await prisma.dienstplanConfig.findMany({
      where: {
        OR: [
          { sheetFileName: { contains: 'Jana', mode: 'insensitive' } },
          { assistantRecipientName: { contains: 'Jana', mode: 'insensitive' } },
        ]
      },
      include: {
        teamSubmissions: {
          where: {
            month: 1,
            year: 2026
          }
        }
      }
    })

    if (janaConfigs.length > 0) {
      console.log(`Found ${janaConfigs.length} DienstplanConfig(s) for Jana:`)
      janaConfigs.forEach(config => {
        console.log(`   - Config ID: ${config.id}`)
        console.log(`     Sheet File Name: ${config.sheetFileName}`)
        console.log(`     Recipient Name: ${config.assistantRecipientName}`)
        console.log(`     Recipient Email: ${config.assistantRecipientEmail}`)
        console.log(`     TeamSubmissions (Jan 2026): ${config.teamSubmissions.length}`)
        config.teamSubmissions.forEach(sub => {
          console.log(`       * Submission ID: ${sub.id}, Status: ${sub.status}, clientId: ${sub.clientId || 'NULL'}`)
        })
      })
    } else {
      console.log('No DienstplanConfigs found for Jana')
    }
    console.log('')

    // 2. Find all employees in Jana's teams
    console.log('2. CHECKING EMPLOYEES IN JANA\'S TEAMS')
    console.log('-'.repeat(80))
    if (janaClient && janaClient.teams.length > 0) {
      const teamIds = janaClient.teams.map(t => t.id)
      const employees = await prisma.user.findMany({
        where: {
          teamId: { in: teamIds },
          role: 'EMPLOYEE'
        },
        include: {
          team: {
            include: {
              client: true
            }
          }
        }
      })

      console.log(`Found ${employees.length} employees in Jana's teams:`)
      employees.forEach(emp => {
        console.log(`   - ${emp.name} (${emp.email})`)
        console.log(`     Team: ${emp.team?.name || 'NO TEAM'}`)
        console.log(`     Team ID: ${emp.teamId || 'NULL'}`)
        console.log(`     Client via Team: ${emp.team?.client?.firstName} ${emp.team?.client?.lastName || 'NO CLIENT'}`)
        console.log(`     Client ID: ${emp.team?.client?.id || 'NULL'}`)
        console.log('')
      })
    } else {
      console.log('No teams found for Jana Scheuer')
    }
    console.log('')

    // 3. Check TeamSubmissions for January 2026
    console.log('3. CHECKING TEAM SUBMISSIONS FOR JANUARY 2026')
    console.log('-'.repeat(80))

    const submissions = await prisma.teamSubmission.findMany({
      where: {
        month: 1,
        year: 2026,
      },
      include: {
        dienstplanConfig: true,
        client: true, // Direct client relation on TeamSubmission
        employeeSignatures: {
          include: {
            employee: {
              include: {
                team: {
                  include: {
                    client: true
                  }
                }
              }
            }
          }
        }
      }
    })

    console.log(`Found ${submissions.length} pending submissions for January 2026`)
    console.log('')

    submissions.forEach((sub, idx) => {
      console.log(`   Submission ${idx + 1}:`)
      console.log(`     ID: ${sub.id}`)
      console.log(`     Status: ${sub.status}`)
      console.log(`     Month/Year: ${sub.month}/${sub.year}`)
      console.log(`     Sheet File Name: ${sub.sheetFileName}`)
      console.log(`     DienstplanConfig ID: ${sub.dienstplanConfigId || 'NULL'}`)

      if (sub.dienstplanConfig) {
        console.log(`     DienstplanConfig Info:`)
        console.log(`       - Config Name: ${sub.dienstplanConfig.sheetFileName}`)
        console.log(`       - Recipient: ${sub.dienstplanConfig.assistantRecipientName}`)
      } else {
        console.log(`     ❌ NO DienstplanConfig found!`)
      }

      console.log(`     Client (direct relation on submission):`)
      if (sub.client) {
        console.log(`       - Client ID: ${sub.client.id}`)
        console.log(`       - Client Name: ${sub.client.firstName} ${sub.client.lastName}`)
      } else {
        console.log(`       - ❌ NO CLIENT LINKED!`)
      }

      console.log(`     Employee Signatures: ${sub.employeeSignatures.length}`)
      sub.employeeSignatures.forEach(sig => {
        console.log(`       - Employee: ${sig.employee.name}`)
        console.log(`         Employee ID: ${sig.employeeId}`)
        console.log(`         Signed: ${sig.signed ? 'YES' : 'NO'}`)
        console.log(`         Team ID: ${sig.employee.teamId || 'NULL'}`)
        console.log(`         Team Name: ${sig.employee.team?.name || 'NO TEAM'}`)
        console.log(`         Client via Team: ${sig.employee.team?.client?.firstName} ${sig.employee.team?.client?.lastName || 'NO CLIENT'}`)
        console.log(`         Client ID via Team: ${sig.employee.team?.client?.id || 'NULL'}`)
      })
      console.log('')
    })

    // 4. Simulate API response
    console.log('4. SIMULATING API RESPONSE FOR /api/admin/submissions')
    console.log('-'.repeat(80))

    const apiResponse = submissions.map(sub => {
      const employeeSignatures = sub.employeeSignatures.map(sig => ({
        employeeId: sig.employeeId,
        employeeName: sig.employee.name,
        signed: sig.signed,
        // This is what the API tries to populate
        clientId: sig.employee.team?.client?.id || null,
        teamId: sig.employee.teamId || null,
        teamName: sig.employee.team?.name || null,
      }))

      return {
        submissionId: sub.id,
        month: sub.month,
        year: sub.year,
        sheetFileName: sub.sheetFileName,
        status: sub.status,
        clientId: sub.clientId || null, // Direct clientId on submission
        clientName: sub.client
          ? `${sub.client.firstName} ${sub.client.lastName}`
          : null,
        employeeSignatures,
      }
    })

    console.log('API Response Preview:')
    console.log(JSON.stringify(apiResponse, null, 2))
    console.log('')

    // 5. Check for issues
    console.log('5. ISSUE DETECTION')
    console.log('-'.repeat(80))

    let issuesFound = false

    apiResponse.forEach((resp, idx) => {
      if (!resp.clientId) {
        console.log(`❌ Issue in Submission ${idx + 1} (ID: ${resp.submissionId}):`)
        console.log(`   clientId is NULL - DienstplanConfig missing or has no client`)
        issuesFound = true
      }

      resp.employeeSignatures.forEach(empSig => {
        if (!empSig.clientId) {
          console.log(`❌ Issue for Employee "${empSig.employeeName}" (ID: ${empSig.employeeId}):`)
          console.log(`   clientId is NULL - Team relationship missing or team has no client`)
          console.log(`   Team ID: ${empSig.teamId || 'NULL'}`)
          console.log(`   Team Name: ${empSig.teamName || 'NULL'}`)
          issuesFound = true
        }
      })
    })

    if (!issuesFound) {
      console.log('✅ No issues detected - all clientIds are populated')
    }
    console.log('')

    // 6. Check timesheets for Jana's employees in January
    console.log('6. CHECKING TIMESHEETS FOR JANUARY 2026')
    console.log('-'.repeat(80))

    if (janaClient && janaClient.teams.length > 0) {
      const teamIds = janaClient.teams.map(t => t.id)
      const timesheets = await prisma.timesheet.findMany({
        where: {
          month: 1,
          year: 2026,
          employee: {
            teamId: { in: teamIds }
          }
        },
        include: {
          employee: {
            include: {
              team: {
                include: {
                  client: true
                }
              }
            }
          }
        },
        take: 5 // Just show first 5 as sample
      })

      console.log(`Found ${timesheets.length} timesheets (showing first 5):`)
      timesheets.forEach(ts => {
        console.log(`   Date: ${ts.date.toISOString().split('T')[0]}`)
        console.log(`   Employee: ${ts.employee.name}`)
        console.log(`   Employee ID: ${ts.employeeId}`)
        console.log(`   Client ID (via team): ${ts.employee.team?.client?.id || 'NULL'}`)
        console.log('')
      })
    }

  } catch (error) {
    console.error('ERROR:', error)
  } finally {
    await prisma.$disconnect()
  }

  console.log('='.repeat(80))
  console.log('DIAGNOSTIC COMPLETE')
  console.log('='.repeat(80))
}

diagnoseJanaClient()
    .catch((error) => {
        console.error('Fatal error:', error)
        process.exit(1)
    })
