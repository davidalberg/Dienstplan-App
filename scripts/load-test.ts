/**
 * Load-Test für die Dienstplan-App
 *
 * Testet die Production-Infrastruktur (Vercel + Supabase) unter Last.
 * Simuliert 20 Mitarbeiter + 2 Admins die gleichzeitig die App nutzen.
 *
 * Ausführung: npx tsx scripts/load-test.ts
 */

import autocannon from "autocannon"

// ============================================================
// Konfiguration
// ============================================================

const BASE_URL = "https://dienstplan-app-three.vercel.app"
const CREDENTIALS = {
    email: "david.alberg@assistenzplus.de",
    password: "password123",
}

// Szenarien
const SCENARIOS = {
    // Szenario A: Dashboard — der schwerste Endpoint (18 parallele DB-Queries)
    dashboardLight: {
        name: "A1: Dashboard (10 Connections)",
        url: "/api/admin/dashboard",
        connections: 10,
        duration: 15,
    },
    dashboardMedium: {
        name: "A2: Dashboard (20 Connections)",
        url: "/api/admin/dashboard",
        connections: 20,
        duration: 15,
    },
    dashboardHeavy: {
        name: "A3: Dashboard (30 Connections)",
        url: "/api/admin/dashboard",
        connections: 30,
        duration: 15,
    },
    // Szenario B: Kalender
    schedule: {
        name: "B: Kalender-Storm (20 Connections)",
        url: "/api/admin/schedule?month=2&year=2026",
        connections: 20,
        duration: 15,
    },
    // Szenario C: Mitarbeiter-Dashboard
    employeeDashboard: {
        name: "C: Mitarbeiter-Timesheets (20 Connections)",
        url: "/api/timesheets?month=2&year=2026",
        connections: 20,
        duration: 15,
    },
    // Szenario D: Mixed Workload — alle Endpoints gleichzeitig
    mixed: {
        name: "D: Mixed Workload (30 Connections)",
        urls: [
            "/api/admin/dashboard",
            "/api/admin/schedule?month=2&year=2026",
            "/api/admin/submissions?month=2&year=2026",
            "/api/admin/timesheets?month=2&year=2026",
            "/api/admin/employees",
            "/api/clients",
        ],
        connections: 30,
        duration: 30,
    },
}

// ============================================================
// Authentifizierung — NextAuth CSRF + Login
// ============================================================

async function getSessionCookie(): Promise<string> {
    console.log("\n🔐 Login als", CREDENTIALS.email, "...")

    // Schritt 1: CSRF-Token holen
    const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
    })

    if (!csrfRes.ok) {
        throw new Error(`CSRF-Request fehlgeschlagen: ${csrfRes.status}`)
    }

    const csrfData = await csrfRes.json()
    const csrfToken = csrfData.csrfToken
    const csrfCookies = csrfRes.headers.getSetCookie?.() || []

    if (!csrfToken) {
        throw new Error("Kein CSRF-Token erhalten")
    }

    // Cookies aus CSRF-Response extrahieren
    const cookieHeader = csrfCookies.map(c => c.split(";")[0]).join("; ")

    console.log("   CSRF-Token erhalten ✓")

    // Schritt 2: Login mit Credentials
    const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: cookieHeader,
        },
        body: new URLSearchParams({
            csrfToken,
            email: CREDENTIALS.email,
            password: CREDENTIALS.password,
            json: "true",
        }).toString(),
        redirect: "manual", // NextAuth redirected nach Login
    })

    // NextAuth gibt 302 Redirect zurück — Session-Cookie ist in den Headers
    const loginCookies = loginRes.headers.getSetCookie?.() || []
    const allCookies = [...csrfCookies, ...loginCookies]

    // Session-Token extrahieren
    const sessionCookie = allCookies
        .map(c => c.split(";")[0])
        .filter(c =>
            c.includes("next-auth.session-token") ||
            c.includes("__Secure-next-auth.session-token") ||
            c.includes("authjs.session-token") ||
            c.includes("__Secure-authjs.session-token")
        )

    if (sessionCookie.length === 0) {
        // Fallback: Alle Cookies verwenden
        const allCookieStr = allCookies.map(c => c.split(";")[0]).join("; ")
        console.log("   ⚠️  Kein explizites Session-Cookie gefunden, verwende alle Cookies")
        console.log("   Status:", loginRes.status)

        // Teste ob die Cookies funktionieren
        const testRes = await fetch(`${BASE_URL}/api/admin/dashboard`, {
            headers: { Cookie: allCookieStr },
        })

        if (testRes.ok) {
            console.log("   Login erfolgreich ✓ (via alle Cookies)")
            return allCookieStr
        }

        // Wenn das auch nicht klappt, zeige Debug-Info
        console.log("   Alle Cookies:", allCookies.map(c => c.split("=")[0]))
        throw new Error(`Login fehlgeschlagen: Status ${loginRes.status}, Test-Request: ${testRes.status}`)
    }

    const cookie = sessionCookie.join("; ")
    console.log("   Login erfolgreich ✓")

    // Verifizieren
    const verifyRes = await fetch(`${BASE_URL}/api/admin/dashboard`, {
        headers: { Cookie: cookie },
    })

    if (!verifyRes.ok) {
        throw new Error(`Session-Verifizierung fehlgeschlagen: ${verifyRes.status}`)
    }

    console.log("   Session verifiziert ✓")
    return cookie
}

// ============================================================
// Load-Test Runner
// ============================================================

interface ScenarioResult {
    name: string
    requestsTotal: number
    requestsPerSec: number
    latencyP50: number
    latencyP99: number
    latencyMax: number
    errors: number
    timeouts: number
    status2xx: number
    statusNon2xx: number
    duration: number
    passed: boolean
}

async function runScenario(
    name: string,
    url: string,
    cookie: string,
    connections: number,
    duration: number
): Promise<ScenarioResult> {
    return new Promise((resolve) => {
        console.log(`\n${"=".repeat(60)}`)
        console.log(`🚀 ${name}`)
        console.log(`   URL: ${url}`)
        console.log(`   Connections: ${connections} | Dauer: ${duration}s`)
        console.log(`${"=".repeat(60)}`)

        const instance = autocannon({
            url: `${BASE_URL}${url}`,
            connections,
            duration,
            headers: {
                Cookie: cookie,
            },
            timeout: 30, // 30 Sekunden Timeout pro Request
        })

        autocannon.track(instance, { renderProgressBar: true })

        instance.on("done", (result) => {
            const errors = result.errors + result.timeouts
            const non2xx = result.non2xx
            const passed = errors === 0 && non2xx === 0 && result.latency.p99 < 5000

            const scenarioResult: ScenarioResult = {
                name,
                requestsTotal: result.requests.total,
                requestsPerSec: Math.round(result.requests.average * 10) / 10,
                latencyP50: result.latency.p50,
                latencyP99: result.latency.p99,
                latencyMax: result.latency.max,
                errors: result.errors,
                timeouts: result.timeouts,
                status2xx: result["2xx"],
                statusNon2xx: result.non2xx,
                duration,
                passed,
            }

            // Ergebnis-Zusammenfassung
            console.log(`\n   📊 Ergebnis:`)
            console.log(`   Requests:  ${scenarioResult.requestsTotal} total (${scenarioResult.requestsPerSec} req/s)`)
            console.log(`   Latency:   p50=${scenarioResult.latencyP50}ms | p99=${scenarioResult.latencyP99}ms | max=${scenarioResult.latencyMax}ms`)
            console.log(`   Status:    2xx=${scenarioResult.status2xx} | non-2xx=${scenarioResult.statusNon2xx}`)
            console.log(`   Errors:    ${scenarioResult.errors} | Timeouts: ${scenarioResult.timeouts}`)
            console.log(`   Ergebnis:  ${passed ? "✅ BESTANDEN" : "❌ DURCHGEFALLEN"}`)

            resolve(scenarioResult)
        })
    })
}

async function runMixedScenario(
    name: string,
    urls: string[],
    cookie: string,
    connections: number,
    duration: number
): Promise<ScenarioResult> {
    // Rotiere URLs über einen Index
    let urlIndex = 0

    return new Promise((resolve) => {
        console.log(`\n${"=".repeat(60)}`)
        console.log(`🚀 ${name}`)
        console.log(`   URLs: ${urls.length} Endpoints gemischt`)
        console.log(`   Connections: ${connections} | Dauer: ${duration}s`)
        console.log(`${"=".repeat(60)}`)

        const instance = autocannon({
            url: `${BASE_URL}${urls[0]}`,
            connections,
            duration,
            headers: {
                Cookie: cookie,
            },
            timeout: 30,
            requests: urls.map(u => ({
                method: "GET" as const,
                path: u,
            })),
        })

        autocannon.track(instance, { renderProgressBar: true })

        instance.on("done", (result) => {
            const errors = result.errors + result.timeouts
            const non2xx = result.non2xx
            const passed = errors === 0 && non2xx === 0 && result.latency.p99 < 5000

            const scenarioResult: ScenarioResult = {
                name,
                requestsTotal: result.requests.total,
                requestsPerSec: Math.round(result.requests.average * 10) / 10,
                latencyP50: result.latency.p50,
                latencyP99: result.latency.p99,
                latencyMax: result.latency.max,
                errors: result.errors,
                timeouts: result.timeouts,
                status2xx: result["2xx"],
                statusNon2xx: result.non2xx,
                duration,
                passed,
            }

            console.log(`\n   📊 Ergebnis:`)
            console.log(`   Requests:  ${scenarioResult.requestsTotal} total (${scenarioResult.requestsPerSec} req/s)`)
            console.log(`   Latency:   p50=${scenarioResult.latencyP50}ms | p99=${scenarioResult.latencyP99}ms | max=${scenarioResult.latencyMax}ms`)
            console.log(`   Status:    2xx=${scenarioResult.status2xx} | non-2xx=${scenarioResult.statusNon2xx}`)
            console.log(`   Errors:    ${scenarioResult.errors} | Timeouts: ${scenarioResult.timeouts}`)
            console.log(`   Ergebnis:  ${passed ? "✅ BESTANDEN" : "❌ DURCHGEFALLEN"}`)

            resolve(scenarioResult)
        })
    })
}

// ============================================================
// Main
// ============================================================

async function main() {
    console.log("╔══════════════════════════════════════════════════════════╗")
    console.log("║     DIENSTPLAN-APP — LOAD TEST (BRUTE FORCE)           ║")
    console.log("║     Target: Production (Vercel + Supabase)             ║")
    console.log("╚══════════════════════════════════════════════════════════╝")
    console.log(`\nTarget: ${BASE_URL}`)
    console.log(`Zeit:   ${new Date().toLocaleString("de-DE")}`)

    // 1. Authentifizieren
    let cookie: string
    try {
        cookie = await getSessionCookie()
    } catch (err) {
        console.error("\n❌ Login fehlgeschlagen:", err)
        process.exit(1)
    }

    // 2. Szenarien ausführen
    const results: ScenarioResult[] = []

    // A1: Dashboard leicht (10 connections)
    results.push(await runScenario(
        SCENARIOS.dashboardLight.name,
        SCENARIOS.dashboardLight.url,
        cookie,
        SCENARIOS.dashboardLight.connections,
        SCENARIOS.dashboardLight.duration
    ))

    // Kurze Pause zwischen Szenarien
    console.log("\n⏳ 5 Sekunden Pause...")
    await new Promise(r => setTimeout(r, 5000))

    // A2: Dashboard mittel (20 connections)
    results.push(await runScenario(
        SCENARIOS.dashboardMedium.name,
        SCENARIOS.dashboardMedium.url,
        cookie,
        SCENARIOS.dashboardMedium.connections,
        SCENARIOS.dashboardMedium.duration
    ))

    await new Promise(r => setTimeout(r, 5000))

    // A3: Dashboard schwer (30 connections)
    results.push(await runScenario(
        SCENARIOS.dashboardHeavy.name,
        SCENARIOS.dashboardHeavy.url,
        cookie,
        SCENARIOS.dashboardHeavy.connections,
        SCENARIOS.dashboardHeavy.duration
    ))

    await new Promise(r => setTimeout(r, 5000))

    // B: Kalender
    results.push(await runScenario(
        SCENARIOS.schedule.name,
        SCENARIOS.schedule.url,
        cookie,
        SCENARIOS.schedule.connections,
        SCENARIOS.schedule.duration
    ))

    await new Promise(r => setTimeout(r, 5000))

    // C: Mitarbeiter-Timesheets
    results.push(await runScenario(
        SCENARIOS.employeeDashboard.name,
        SCENARIOS.employeeDashboard.url,
        cookie,
        SCENARIOS.employeeDashboard.connections,
        SCENARIOS.employeeDashboard.duration
    ))

    await new Promise(r => setTimeout(r, 5000))

    // D: Mixed Workload
    results.push(await runMixedScenario(
        SCENARIOS.mixed.name,
        SCENARIOS.mixed.urls,
        cookie,
        SCENARIOS.mixed.connections,
        SCENARIOS.mixed.duration
    ))

    // 3. Gesamtbericht
    console.log("\n")
    console.log("╔══════════════════════════════════════════════════════════╗")
    console.log("║                 GESAMTBERICHT                          ║")
    console.log("╚══════════════════════════════════════════════════════════╝")
    console.log("")

    // Tabelle
    console.log("┌─────────────────────────────────────┬────────┬────────┬────────┬────────┬────────┬──────────┐")
    console.log("│ Szenario                            │ Req/s  │ p50    │ p99    │ Errors │ non2xx │ Status   │")
    console.log("├─────────────────────────────────────┼────────┼────────┼────────┼────────┼────────┼──────────┤")

    let allPassed = true
    for (const r of results) {
        const status = r.passed ? "✅ PASS" : "❌ FAIL"
        if (!r.passed) allPassed = false

        const name = r.name.padEnd(35)
        const rps = String(r.requestsPerSec).padStart(6)
        const p50 = (r.latencyP50 + "ms").padStart(6)
        const p99 = (r.latencyP99 + "ms").padStart(6)
        const errors = String(r.errors).padStart(6)
        const non2xx = String(r.statusNon2xx).padStart(6)

        console.log(`│ ${name} │ ${rps} │ ${p50} │ ${p99} │ ${errors} │ ${non2xx} │ ${status} │`)
    }

    console.log("└─────────────────────────────────────┴────────┴────────┴────────┴────────┴────────┴──────────┘")

    // Gesamtergebnis
    console.log("")
    if (allPassed) {
        console.log("🎉 ALLE SZENARIEN BESTANDEN — Die App hält der Last stand!")
    } else {
        console.log("⚠️  EINIGE SZENARIEN DURCHGEFALLEN — Optimierung nötig!")
        console.log("")
        console.log("Kriterien: 0 Errors, 0 non-2xx, p99 < 5000ms")
    }

    console.log(`\nTest abgeschlossen: ${new Date().toLocaleString("de-DE")}`)
}

main().catch(console.error)
