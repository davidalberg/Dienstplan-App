import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function cleanupBadConfigs() {
    console.log('🧹 Bereinige fehlerhafte DienstplanConfigs...\n')

    try {
        // Find all configs
        const allConfigs = await prisma.dienstplanConfig.findMany({
            orderBy: { sheetFileName: 'asc' }
        })

        console.log('📋 Alle DienstplanConfigs:')
        console.log('='.repeat(80))
        allConfigs.forEach((config, idx) => {
            const isBad = config.sheetFileName.includes('Team_Team_') ||
                         config.sheetFileName.match(/_\d{4}_\d{4}$/)

            console.log(`${idx + 1}. ${config.sheetFileName} ${isBad ? '❌ FEHLERHAFT' : '✅'}`)
            console.log(`   ID: ${config.id}`)
            console.log(`   Recipient: ${config.assistantRecipientName}`)
            console.log('')
        })

        // Find bad configs
        const badConfigs = allConfigs.filter(c =>
            c.sheetFileName.includes('Team_Team_') ||
            c.sheetFileName.match(/_\d{4}_\d{4}$/)
        )

        if (badConfigs.length === 0) {
            console.log('✅ Keine fehlerhaften Configs gefunden!')
            return
        }

        console.log(`\n⚠️  ${badConfigs.length} fehlerhafte Config(s) gefunden:\n`)
        badConfigs.forEach(c => {
            console.log(`  - ${c.sheetFileName}`)
        })

        console.log('\n🗑️  Lösche fehlerhafte Configs...')

        for (const config of badConfigs) {
            await prisma.dienstplanConfig.delete({
                where: { id: config.id }
            })
            console.log(`  ✅ Gelöscht: ${config.sheetFileName}`)
        }

        console.log('\n✨ Bereinigung abgeschlossen!')

        // Show remaining configs
        const remainingConfigs = await prisma.dienstplanConfig.findMany({
            orderBy: { sheetFileName: 'asc' }
        })

        console.log('\n📋 Verbleibende DienstplanConfigs:')
        remainingConfigs.forEach(c => {
            console.log(`  ✅ ${c.sheetFileName}`)
        })

    } catch (error) {
        console.error('❌ Fehler:', error)
        throw error
    } finally {
        await prisma.$disconnect()
    }
}

cleanupBadConfigs()
    .catch((error) => {
        console.error('Fatal error:', error)
        process.exit(1)
    })
