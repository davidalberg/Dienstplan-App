import { chromium } from '@playwright/test'

async function debugAPIResponse() {
    console.log('🔍 Starte Playwright API Debug...\n')

    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
        // Go to login page
        console.log('📍 Navigiere zu Login...')
        await page.goto('http://localhost:3000/login')
        await page.waitForLoadState('networkidle')

        // Login as admin
        console.log('🔐 Logge ein als Admin...')
        await page.fill('input[type="email"]', 'admin@test.de')
        await page.fill('input[type="password"]', 'admin123')
        await page.click('button[type="submit"]')
        await page.waitForURL('**/admin**', { timeout: 10000 })
        console.log('✅ Login erfolgreich\n')

        // Navigate to timesheets page
        console.log('📍 Navigiere zu Stundennachweise...')
        await page.goto('http://localhost:3000/admin/timesheets')
        await page.waitForLoadState('networkidle')

        // Intercept API call
        console.log('🎯 Warte auf API-Call...\n')
        const responsePromise = page.waitForResponse(
            response => response.url().includes('/api/admin/submissions') && response.status() === 200,
            { timeout: 10000 }
        )

        // Trigger API call by going to the page (already done)
        const response = await responsePromise
        const data = await response.json()

        console.log('📦 API Response erhalten!\n')
        console.log('='.repeat(80))
        console.log('URL:', response.url())
        console.log('Status:', response.status())
        console.log('='.repeat(80))

        // Find Jana Scheuer submission
        const allSubmissions = [...(data.submissions || []), ...(data.pendingDienstplaene || [])]
        console.log(`\n📊 Gesamt Submissions: ${allSubmissions.length}\n`)

        const janaSubmission = allSubmissions.find((s: any) =>
            s.sheetFileName?.toLowerCase().includes('jana') &&
            s.sheetFileName?.toLowerCase().includes('scheuer')
        )

        if (janaSubmission) {
            console.log('🎯 Jana Scheuer Submission gefunden:\n')
            console.log(JSON.stringify(janaSubmission, null, 2))
            console.log('\n' + '='.repeat(80))
            console.log('🔍 CLIENT ID CHECK:')
            console.log('='.repeat(80))
            console.log(`clientId: ${janaSubmission.clientId || '❌ FEHLT!'}`)
            console.log(`client object:`, janaSubmission.client)
            console.log('='.repeat(80))

            if (!janaSubmission.clientId) {
                console.log('\n❌ PROBLEM: clientId fehlt in der API-Response!')
                console.log('Das erklärt den Fehler "Klient-Zuordnung fehlt"')
            } else {
                console.log('\n✅ clientId ist vorhanden in der API-Response!')
                console.log('Das Problem muss im Frontend-Code sein.')
            }
        } else {
            console.log('❌ Keine Jana Scheuer Submission gefunden!')
            console.log('\nAlle Submissions:')
            allSubmissions.forEach((s: any, idx: number) => {
                console.log(`${idx + 1}. ${s.sheetFileName} (${s.status})`)
            })
        }

    } catch (error) {
        console.error('❌ Fehler:', error)
        throw error
    } finally {
        await browser.close()
    }
}

debugAPIResponse()
    .catch((error) => {
        console.error('Fatal error:', error)
        process.exit(1)
    })
