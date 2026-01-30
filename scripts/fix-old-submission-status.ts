/**
 * Script to fix old submission statuses
 *
 * Problem: Old timesheets were not updated to SUBMITTED/COMPLETED when submissions were signed
 * Solution: Update all timesheets based on their TeamSubmission status
 *
 * Run: npx ts-node scripts/fix-old-submission-status.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('🔧 Starting fix-old-submission-status script...\n')

    // Find all TeamSubmissions that have been signed
    const submissions = await prisma.teamSubmission.findMany({
        where: {
            OR: [
                { status: 'PENDING_RECIPIENT' }, // Employee signed, waiting for client
                { status: 'COMPLETED' }          // Both signed
            ]
        },
        select: {
            id: true,
            sheetFileName: true,
            month: true,
            year: true,
            status: true,
            employeeSignatures: {
                select: {
                    employeeId: true,
                    signedAt: true
                }
            }
        }
    })

    console.log(`Found ${submissions.length} submissions to fix\n`)

    let totalFixed = 0

    for (const submission of submissions) {
        console.log(`Processing: ${submission.sheetFileName} ${submission.month}/${submission.year} (${submission.status})`)

        // Determine target status for timesheets
        const targetStatus = submission.status === 'COMPLETED' ? 'COMPLETED' : 'SUBMITTED'

        // Update all timesheets for this submission
        const result = await prisma.timesheet.updateMany({
            where: {
                sheetFileName: submission.sheetFileName,
                month: submission.month,
                year: submission.year,
                // Only update if not already correct
                NOT: {
                    status: targetStatus
                }
            },
            data: {
                status: targetStatus
            }
        })

        if (result.count > 0) {
            console.log(`  ✅ Updated ${result.count} timesheets to ${targetStatus}`)
            totalFixed += result.count
        } else {
            console.log(`  ℹ️  Already correct (0 updates needed)`)
        }
    }

    console.log(`\n✨ Done! Fixed ${totalFixed} timesheets across ${submissions.length} submissions`)
}

main()
    .catch((e) => {
        console.error('❌ Error:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
