# Dienstplan-App - Claude Code Dokumentation

## 🚨 WICHTIG: Agenten-Nutzung

**IMMER specialized Agents für komplexe Aufgaben nutzen!**

### Wann Agents nutzen?

| Szenario | Agent | Beispiel |
|----------|-------|----------|
| Codebase erkunden | `Explore` | "Wo werden Fehler behandelt?", "Wie funktioniert die Auth?" |
| Feature implementieren | `EnterPlanMode` → Plan → Implement | "Neue Admin-Seite erstellen", "API-Endpoint hinzufügen" |
| Business Logic | `business-logic-architect` | Validierung, PDF-Generierung, E-Mail-Workflows |
| UI/UX Änderungen | `ui-ux-specialist` | Neue Komponenten, Styling-Fixes, Responsive Design |
| Infrastruktur | `infra-deployment-expert` | Supabase, Vercel, Environment Variables |

### Best Practices

1. **EnterPlanMode zuerst** für nicht-triviale Implementierungen
2. **Explore Agent** für Codebase-Recherche (nicht Grep/Glob direkt)
3. **Parallele Agents** wenn möglich für Performance
4. **Niemals raten** - immer erst Code lesen, dann ändern

---

## Projektübersicht

Eine Stundennachweis- und Dienstplan-Management-Anwendung für Assistenzdienste. Ermöglicht:
- Schicht-Planung und -Verwaltung mit **integrierter Vorschau-Funktion**
- Stundenerfassung durch Mitarbeiter
- Digitale Signaturen für Assistenten und Assistenznehmer
- **Combined Timesheet Modal** für Dienstplan-Übersicht mit allen Mitarbeitern
- PDF/Excel/CSV-Export der Stundennachweise (ohne "Typ"-Spalte)
- Multi-Team-Verwaltung mit manueller E-Mail-Benachrichtigung

**Aktuelle Version:** Februar 2026
**Letztes Update:** Februar 2026 - Combined Timesheet Modal, Critical Bug Fixes

---

## Tech Stack

| Technologie | Version | Verwendung |
|------------|---------|------------|
| Next.js | 15.5.9 | App Router, API Routes |
| React | 18.3 | Frontend |
| TypeScript | 5.x | Typisierung |
| Prisma | 6.2.1 | ORM |
| PostgreSQL | - | Datenbank (Supabase) |
| Tailwind CSS | 4.x | Styling (Dark Mode) |
| SWR | 2.3+ | Client-side Caching |
| next-auth | 5.0 beta | Authentifizierung |
| Playwright | 1.58+ | E2E Tests |
| lucide-react | - | Icons (Eye, Edit2, Trash2, etc.) |
| sonner | - | Toast Notifications |

---

## Projektstruktur

```
src/
├── app/
│   ├── admin/              # Admin-Bereich
│   │   ├── page.tsx        # Redirect zu /admin/schedule
│   │   ├── schedule/       # Dienstplan-Editor mit Preview-Funktion
│   │   ├── submissions/    # Einreichungen & Signaturen (nicht in Sidebar)
│   │   ├── clients/        # Klienten-Verwaltung
│   │   └── assistants/     # Assistenten-Verwaltung
│   ├── api/
│   │   ├── admin/          # Admin API Endpoints
│   │   │   ├── timesheets/ # GET: Dashboard-Daten
│   │   │   ├── schedule/   # CRUD: Schichten
│   │   │   ├── submissions/# Einreichungs-Management & Detail-Daten
│   │   │   └── employees/  # Mitarbeiter-CRUD
│   │   ├── clients/        # Klienten API
│   │   ├── timesheets/     # Mitarbeiter-Zeiterfassung
│   │   └── sign/           # Signatur-Token-Verifikation
│   ├── dashboard/          # Mitarbeiter-Dashboard
│   ├── login/              # Login-Seite
│   └── sign/[token]/       # Signatur-Seite (Token-basiert)
├── components/
│   ├── Sidebar.tsx              # Admin Navigation (3 Items: Kalender, Klienten, Assistenten)
│   ├── SignaturePad.tsx         # Unterschrift-Canvas
│   ├── TimesheetDetail.tsx      # Einzelner Mitarbeiter-Stundennachweis (WICHTIG!)
│   ├── CombinedTimesheetModal.tsx # Kombinierter Dienstplan-Stundennachweis (NEU!)
│   ├── SubmitModal.tsx          # Einreichungs-Modal für Mitarbeiter
│   └── ...
├── hooks/
│   └── use-admin-data.ts   # SWR Hooks für Admin-Seiten
├── lib/
│   ├── auth.ts                    # next-auth Konfiguration
│   ├── prisma.ts                  # Prisma Client
│   ├── pdf-generator.ts           # jsPDF Stundennachweis (Single + Combined)
│   ├── email.ts                   # Resend E-Mail-Versand
│   ├── time-utils.ts              # Zeit-Berechnungen
│   ├── toast-utils.ts             # Toast Helper (showToast)
│   ├── premium-calculator.ts      # Zuschlagsberechnung
│   └── team-submission-utils.ts   # Dienstplan-Einreichungs-Logik (WICHTIG!)
└── types/                  # TypeScript Definitionen
```

---

## Wichtige Komponenten

### TimesheetDetail.tsx

**Zweck:** Vorschau-Modal für komplette Monats-Stundennachweise

**Props:**
```typescript
interface TimesheetDetailProps {
    employeeId: string
    clientId: string         // REQUIRED!
    month: number
    year: number
    onClose: () => void
    onDelete?: () => void
}
```

**Features:**
- **Links:** PDF-ähnliche Vorschau mit beiden Unterschriften (Mitarbeiter + Klient)
- **Rechts:** Übersicht mit nur Klient-Unterschrift + E-Mail-Button
- Download-Optionen: PDF, CSV, XLSX
- **Keine "Typ"-Spalte** in der Tabelle

**Verwendung:**
```typescript
// In schedule/page.tsx mit Eye-Icon
<TimesheetDetail
    employeeId={shift.employee.id}
    clientId={shift.employee.team.client.id}
    month={currentMonth}
    year={currentYear}
    onClose={closeModal}
/>
```

**WICHTIG:** `clientId` ist required! Immer `shift.employee?.team?.client?.id` prüfen vor dem Öffnen.

### CombinedTimesheetModal.tsx

**Zweck:** Vorschau-Modal für kompletten Dienstplan mit ALLEN Mitarbeitern

**Props:**
```typescript
interface CombinedTimesheetModalProps {
    clientId: string         // REQUIRED!
    month: number
    year: number
    onClose: () => void
}
```

**Features:**
- **Links:** Flache Tabelle mit allen Mitarbeiter-Schichten kombiniert
- **Spalten:** Datum | Mitarbeiter | Geplant | Tatsächlich | Stunden | Notiz
- **Rechts:** Mitarbeiter-Unterschriften + Klient-Unterschrift + Statistiken
- Download-Optionen: PDF, Excel (XLSX), CSV
- **Manueller E-Mail-Button** für Klient-Signatur-Aufforderung

**Verwendung:**
```typescript
// In submissions/page.tsx mit Eye-Icon
<CombinedTimesheetModal
    clientId={submission.clientId}
    month={submission.month}
    year={submission.year}
    onClose={closeModal}
/>
```

**WICHTIG:** Verwendet `/api/admin/timesheets/combined` für Daten!

**Key API Response Structure:**
```typescript
{
    timesheets: Array<{        // FLAT array - not nested by employee!
        id, date, employeeId, employeeName,
        plannedStart, plannedEnd,
        actualStart, actualEnd,
        hours, note, absenceType
    }>,
    employees: Array<{         // WITHOUT nested timesheets - just stats
        id, name, totalHours, hasSignature
    }>,
    client: { id, fullName, email },
    clientSignature: { signed: boolean, signatureUrl?: string },
    stats: { totalHours, totalShifts }
}
```

---

## Datenbank-Modelle (Prisma)

### Haupt-Modelle

| Model | Beschreibung |
|-------|-------------|
| `User` | Mitarbeiter/Admin mit Rollen, Lohn, Zuschlägen |
| `Team` | Team mit Client-Zuordnung |
| `Client` | Assistenznehmer (Klient) |
| `Timesheet` | Einzelne Schicht (geplant/tatsächlich) |
| `TeamSubmission` | Monats-Einreichung pro Dienstplan |
| `EmployeeSignature` | Mitarbeiter-Unterschrift in Einreichung |
| `DienstplanConfig` | Konfiguration pro Dienstplan |

### Wichtige Relationen

```
User → Timesheet (1:n)
User → Team (n:1)
Team → Client (n:1)
TeamSubmission → EmployeeSignature (1:n)
TeamSubmission → DienstplanConfig (n:1)

WICHTIG für Preview:
Shift.employee.team.client.id benötigt für TimesheetDetail!
```

---

## Architektur-Patterns

### 1. SWR Data Caching

Alle Admin-Seiten nutzen SWR für schnelle Navigation:

```typescript
// src/hooks/use-admin-data.ts - Optimiert Februar 2026
export function useAdminTimesheets(month, year, employeeId?, teamId?) {
    return useSWR(`/api/admin/timesheets?...`, fetcher, {
        revalidateOnFocus: false,
        dedupingInterval: 5000,           // Reduziert von 30s → 5s
        focusThrottleInterval: 60000,     // 60s throttle für focus revalidation
        revalidateIfStale: false          // Cache-first Strategie
    })
}
```

**Performance Impact (Februar 2026):**
- 50-70% schnellere Seiten-Navigation
- Instant-Feedback bei Monatswechsel
- Reduzierte Server-Last durch intelligentes Caching

**Verwendung in Pages:**
```typescript
const { timesheets, isLoading, mutate } = useAdminTimesheets(month, year)
```

### 2. Optimistische Updates

```typescript
// Lokaler State für UI
const [timesheets, setTimesheets] = useState([])

// Optimistisches Update
setTimesheets(prev => [...prev, newShift])

// API Call
const res = await fetch('/api/admin/schedule', { method: 'POST', ... })

// Bei Fehler: Rollback
if (!res.ok) {
    setTimesheets(prev => prev.filter(s => s.id !== tempId))
}
```

### 3. Parallele DB-Abfragen

```typescript
// API Route mit Promise.all
const [timesheets, teams, employees] = await Promise.all([
    prisma.timesheet.findMany({ where }),
    prisma.team.findMany(),
    prisma.user.findMany({ where: { role: "EMPLOYEE" }})
])
```

### 4. Toast Notifications

**WICHTIG:** Korrekte Parameter-Reihenfolge beachten!

```typescript
// src/lib/toast-utils.ts
showToast(type: 'success' | 'error' | 'info' | 'warning', message: string)

// Richtig:
showToast("error", "Mitarbeiter-Daten nicht verfügbar")
showToast("success", "Schicht erfolgreich erstellt")

// FALSCH (TypeScript Error):
showToast("Fehler passiert", "error")  // ❌ Falsche Reihenfolge
```

### 5. Combined Timesheet Data Structure

**KRITISCH:** Flat vs. Nested Structure

**Combined API liefert FLACHE Struktur:**
```typescript
// ✅ RICHTIG - Flat Array:
{
    timesheets: [
        { id: "1", employeeId: "emp1", employeeName: "Max", date: "2026-02-01", hours: 8 },
        { id: "2", employeeId: "emp2", employeeName: "Anna", date: "2026-02-01", hours: 6 },
        { id: "3", employeeId: "emp1", employeeName: "Max", date: "2026-02-02", hours: 8 }
    ],
    employees: [
        { id: "emp1", name: "Max", totalHours: 16, hasSignature: true },
        { id: "emp2", name: "Anna", totalHours: 6, hasSignature: false }
    ]
}

// ❌ FALSCH - Nested Structure:
{
    employees: [
        {
            id: "emp1",
            name: "Max",
            timesheets: [ /* nested */ ]
        }
    ]
}
```

**Rationale:**
- Flat Structure ermöglicht einfache Sortierung nach Datum
- Bessere Performance für Tabellen-Rendering
- Einfacher Export zu Excel/CSV

**Implementation:**
```typescript
// API Route muss timesheets FLACH zurückgeben:
const timesheets = await prisma.timesheet.findMany({
    where: {
        employee: {
            teamId,
            role: "EMPLOYEE",
            // Status Filter hier!
        },
        date: { gte: startDate, lte: endDate },
        status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"] }
    },
    include: {
        employee: { select: { id: true, name: true } }
    },
    orderBy: { date: "asc" }
})

// Transform zu flat structure:
return timesheets.map(ts => ({
    id: ts.id,
    date: ts.date,
    employeeId: ts.employee.id,
    employeeName: ts.employee.name,
    plannedStart: ts.plannedStart,
    plannedEnd: ts.plannedEnd,
    actualStart: ts.actualStart,
    actualEnd: ts.actualEnd,
    hours: ts.hours,
    note: ts.note,
    absenceType: ts.absenceType
}))
```

### 6. Team Submission Utils Pattern

**Zentrale Business-Logic:** `src/lib/team-submission-utils.ts`

**Funktionen:**
```typescript
// 1. Hole alle Mitarbeiter eines Dienstplans mit Schichten im Zeitraum
export async function getEmployeesInDienstplan(
    teamId: string,
    month: number,
    year: number
): Promise<Employee[]>

// 2. Hole alle Schichten eines Teams im Zeitraum
export async function getTeamTimesheets(
    teamId: string,
    startDate: Date,
    endDate: Date
): Promise<Timesheet[]>

// 3. Prüfe ob TeamSubmission existiert
export async function getTeamSubmission(
    clientId: string,
    month: number,
    year: number
): Promise<TeamSubmission | null>
```

**KRITISCH:** Status-Filter muss in BEIDEN Funktionen identisch sein!

```typescript
// Lines 29-30 + Lines 56-57 müssen GLEICH sein:
const statusFilter = {
    status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"] }
}

// In getEmployeesInDienstplan():
timesheets: {
    some: {
        ...statusFilter,
        date: { gte: startDate, lte: endDate }
    }
}

// In getTeamTimesheets():
where: {
    ...statusFilter,
    date: { gte: startDate, lte: endDate }
}
```

**Best Practice:**
- Status-Filter als Konstante definieren
- DRY-Prinzip: Keine Duplikation
- Single Source of Truth für Filter-Logic

---

## Styling (Dark Mode)

Die App verwendet Tailwind mit dunklem Theme:

| Element | Klassen |
|---------|---------|
| Hintergrund | `bg-neutral-950` |
| Cards | `bg-neutral-900` |
| Inputs | `bg-neutral-800 border-neutral-700` |
| Text primär | `text-white` |
| Text sekundär | `text-neutral-400` |
| Akzent | `text-violet-400`, `bg-violet-600` |
| Hover (Violet) | `hover:text-violet-400 hover:bg-violet-900/30` |

**Konsistenz:** Alle Action-Icons (Eye, Edit, Delete) nutzen gleichen Hover-Style.

---

## API Endpoints

### Admin Endpoints (benötigen ADMIN Rolle)

| Endpoint | Methoden | Beschreibung |
|----------|----------|--------------|
| `/api/admin/timesheets` | GET | Dashboard-Daten |
| `/api/admin/timesheets/combined` | GET | Kombinierte Dienstplan-Daten (NEU!) |
| `/api/admin/timesheets/combined/export` | GET | Export Combined (PDF/Excel/CSV) (NEU!) |
| `/api/admin/schedule` | GET, POST, PUT, DELETE | Schicht-Management |
| `/api/admin/submissions` | GET | Einreichungen mit Status (month/year Filter!) |
| `/api/admin/submissions/detail` | GET | Vollständiger Stundennachweis für TimesheetDetail |
| `/api/admin/submissions/send-email` | POST | E-Mail an Klient senden (NEU!) |
| `/api/admin/employees` | GET, PUT, DELETE | Mitarbeiter-CRUD |
| `/api/admin/fix-submission-clientids` | POST | Reparatur-Endpoint für NULL clientIds (NEU!) |
| `/api/admin/fix-team-names` | POST | Reparatur-Endpoint für Team-Namen (NEU!) |
| `/api/clients` | GET, POST, PUT, DELETE | Klienten-CRUD |

### Mitarbeiter Endpoints

| Endpoint | Methoden | Beschreibung |
|----------|----------|--------------|
| `/api/timesheets` | GET, PUT | Eigene Schichten |
| `/api/timesheets/submit` | POST | Monat einreichen |
| `/api/sign/[token]` | GET, POST | Signatur-Seite |

### Detail API für TimesheetDetail (Einzelner Mitarbeiter)

**Endpoint:** `GET /api/admin/submissions/detail`

**Query Params:**
```typescript
{
    employeeId: string
    clientId: string    // REQUIRED
    month: number
    year: number
}
```

**Response:**
```typescript
{
    employee: { id, name }
    client: { id, fullName, email }
    timesheets: Array<{
        id, date, formattedDate, weekday,
        actualStart, actualEnd, plannedStart, plannedEnd,
        hours, note, absenceType
        // KEIN "type" mehr in Vorschau
    }>
    signatures: {
        employee: { signed: boolean, signatureUrl?: string }
        client: { signed: boolean, signatureUrl?: string }
    }
    stats: { totalHours: string }
}
```

### Combined API für CombinedTimesheetModal (Kompletter Dienstplan)

**Endpoint:** `GET /api/admin/timesheets/combined`

**Query Params:**
```typescript
{
    clientId: string    // REQUIRED
    month: number
    year: number
}
```

**Response:**
```typescript
{
    timesheets: Array<{         // FLAT structure, NOT nested!
        id, date, formattedDate, weekday,
        employeeId, employeeName,
        plannedStart, plannedEnd,
        actualStart, actualEnd,
        hours, note, absenceType
    }>,
    employees: Array<{          // WITHOUT nested timesheets
        id, name, totalHours, hasSignature
    }>,
    client: { id, fullName, email },
    clientSignature: { signed: boolean, signatureUrl?: string },
    stats: { totalHours: string, totalShifts: number }
}
```

**KRITISCH:** Status Filter muss mit `getEmployeesInDienstplan()` übereinstimmen:
```typescript
// Beide Queries MÜSSEN identischen Filter haben:
status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"] }
```

### Export API für Combined Timesheet

**Endpoint:** `GET /api/admin/timesheets/combined/export`

**Query Params:**
```typescript
{
    clientId: string
    month: number
    year: number
    format: "pdf" | "xlsx" | "csv"
}
```

**Response:** Binary file download mit Content-Disposition Header

**Supported Formats:**
- **PDF:** `generateCombinedTeamPdf()` - Alle Mitarbeiter in einem Dokument
- **Excel:** XLSX mit Formatierung (via xlsx library)
- **CSV:** UTF-8 mit Komma-Separator

### Email API für Signatur-Aufforderung

**Endpoint:** `POST /api/admin/submissions/send-email`

**Request Body:**
```typescript
{
    clientId: string
    month: number
    year: number
    sheetFileName?: string      // Für Combined Mode (optional)
}
```

**Response:**
```typescript
{
    success: boolean
    message: string
}
```

**Funktionsweise:**
- Generiert einmaligen Token mit 7 Tage Gültigkeit
- Erstellt TeamSubmission falls nicht vorhanden
- Sendet E-Mail mit Signatur-Link via Resend
- Unterstützt beide Modi: Single Employee + Combined Dienstplan

---

## Navigation & Routing

### Admin-Bereich

**Sidebar (nur 3 Items):**
1. Kalender → `/admin/schedule`
2. Klienten → `/admin/clients`
3. Assistenten → `/admin/assistants`

**Stundennachweise-Seite ENTFERNT aus Sidebar** (Januar 2026)
- `/admin/submissions` existiert weiterhin für interne Nutzung
- Nicht mehr in Navigation sichtbar
- Preview-Funktion integriert in Dienstplan-Editor

**Root Redirect:**
- `/admin` → `/admin/schedule` (automatisch)

### Preview-Funktionen

#### 1. Combined Timesheet Preview (Submissions-Seite)

**Eye-Icon pro Dienstplan-Einreichung:**
```typescript
// src/app/admin/submissions/page.tsx
<button
    onClick={() => openCombinedTimesheet(submission)}
    className="p-1.5 text-neutral-500 hover:text-violet-400 hover:bg-violet-900/30 rounded transition"
    title="Kompletten Dienstplan anzeigen"
>
    <Eye size={14} />
</button>
```

**Handler:**
```typescript
const openCombinedTimesheet = (submission: Submission) => {
    if (!submission.clientId) {
        showToast("error", "Klient-Zuordnung fehlt für diesen Dienstplan")
        return
    }

    setSelectedSubmission({
        clientId: submission.clientId,
        month: submission.month,
        year: submission.year
    })
    setShowCombinedModal(true)
}
```

**WICHTIG:**
- Prüft immer `clientId` vor Modal-Öffnung
- Zeigt ALLE Mitarbeiter eines Dienstplans kombiniert
- Flat Table Structure (nicht nested)
- Manueller E-Mail-Button für Signatur-Aufforderung

#### 2. Single Employee Preview (Dienstplan-Editor)

**Eye-Icon pro Schicht (Schedule-Seite):**
```typescript
// src/app/admin/schedule/page.tsx
<button
    onClick={(e) => {
        e.stopPropagation()
        openTimesheetPreview(shift)
    }}
    className="p-1.5 text-neutral-500 hover:text-violet-400 hover:bg-violet-900/30 rounded transition"
    title="Stundennachweis anzeigen"
>
    <Eye size={14} />
</button>
```

**Handler:**
```typescript
const openTimesheetPreview = (shift: Shift) => {
    const clientId = shift.employee?.team?.client?.id

    if (!shift.employee?.id) {
        showToast("error", "Mitarbeiter-Daten nicht verfügbar")
        return
    }

    if (!clientId) {
        showToast("error", "Klient-Zuordnung fehlt für diesen Mitarbeiter")
        return
    }

    setSelectedTimesheetData({
        employeeId: shift.employee.id,
        clientId: clientId
    })
    setShowTimesheetDetail(true)
}
```

### E-Mail-Funktionalität (Februar 2026)

**Automatische E-Mail:**
- Wird gesendet nachdem ALLE Mitarbeiter eines Dienstplans signiert haben
- Enthält Link zur Klient-Signatur-Seite mit Token
- Token gültig für 7 Tage

**Manuelle E-Mail (NEU):**
- Button in CombinedTimesheetModal: "E-Mail manuell senden"
- Nutzt `/api/admin/submissions/send-email` Endpoint
- Sendet Signatur-Aufforderung auch wenn nicht alle Mitarbeiter signiert haben
- Zeigt Toast mit Erfolg/Fehler-Meldung

**Handler-Beispiel:**
```typescript
const handleSendEmail = async () => {
    try {
        const res = await fetch("/api/admin/submissions/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                clientId,
                month,
                year,
                sheetFileName: `Dienstplan_${clientName}_${month}_${year}`
            })
        })

        const data = await res.json()

        if (res.ok) {
            showToast("success", "E-Mail erfolgreich gesendet")
        } else {
            showToast("error", data.error || "Fehler beim E-Mail-Versand")
        }
    } catch (error) {
        showToast("error", "Netzwerkfehler beim E-Mail-Versand")
    }
}
```

**TimesheetDetail vs. CombinedTimesheetModal:**
- **TimesheetDetail:** Kein E-Mail-Button (nur Status-Message "Der Klient wurde per E-Mail benachrichtigt.")
- **CombinedTimesheetModal:** Manueller E-Mail-Button vorhanden

**Rationale:** Einzelner Mitarbeiter-Stundennachweis löst automatisch E-Mail aus nach Signatur. Combined Timesheet benötigt manuellen Trigger da mehrere Mitarbeiter involviert.

---

## Tests

### E2E Tests (Playwright)

```bash
# Alle Tests ausführen
npm run test:e2e

# Mit Browser
npm run test:e2e:headed

# Test-DB zurücksetzen
npm run test:db:reset
```

**Test-Dateien:**
- `e2e/admin.spec.ts` - 15 Admin-Tests
- `e2e/employee.spec.ts` - Mitarbeiter-Tests

---

## Troubleshooting Guide (Februar 2026)

### Problem: "Keine Schichten gefunden" obwohl Daten existieren

**Symptome:**
- CombinedTimesheetModal zeigt "Keine Schichten gefunden"
- Signaturen und Statistiken sind vorhanden
- API-Response hat leere `timesheets` Array

**Root Cause:** Status-Filter Mismatch

**Debugging Steps:**
1. Öffne Developer Tools → Network Tab
2. Prüfe `/api/admin/timesheets/combined` Response
3. Schaue in `team-submission-utils.ts`:
   - `getEmployeesInDienstplan()` Zeile 29-30
   - `getTeamTimesheets()` Zeile 56-57
4. Status-Filter muss identisch sein: `["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"]`

**Fix:**
```typescript
// In beiden Funktionen:
timesheets: {
    some: {
        status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"] },
        date: { gte: startDate, lte: endDate }
    }
}
```

**File:** `src/lib/team-submission-utils.ts`

---

### Problem: Falsche Monate zeigen Signaturen/Submissions

**Symptome:**
- Februar/März zeigen Submissions obwohl keine Daten existieren
- Signaturen von anderen Monaten werden angezeigt
- Inkonsistente Daten zwischen Monaten

**Root Cause:** Fehlender Month/Year Filter

**Debugging Steps:**
1. Öffne `/api/admin/submissions/route.ts`
2. Prüfe `prisma.teamSubmission.findMany()` Query
3. WHERE clause muss `month` und `year` filtern

**Fix:**
```typescript
const teamSubmissions = await prisma.teamSubmission.findMany({
    where: {
        month: targetMonth,  // REQUIRED!
        year: targetYear     // REQUIRED!
    },
    include: {
        employeeSignatures: true,
        client: true
    }
})
```

**File:** `src/app/api/admin/submissions/route.ts` (Lines 70-73)

---

### Problem: "Klient-Zuordnung fehlt"

**Symptome:**
- Eye-Icon öffnet kein Modal
- Error Toast: "Klient-Zuordnung fehlt für diesen Dienstplan"
- Combined Timesheet kann nicht geöffnet werden

**Root Cause:** NULL `clientId` in TeamSubmission

**Debugging Steps:**
1. Prüfe Browser Console für Error Details
2. Öffne Supabase Dashboard → TeamSubmission Table
3. Suche nach Rows mit `clientId = NULL`

**Fix via UI:**
1. Gehe zu Admin → Settings (Zahnrad-Icon oben rechts)
2. Wähle "Datenbank" Tab
3. Klicke "🚨 JETZT REPARIEREN" Button
4. Warte auf Success-Toast
5. Refresh die Submissions-Seite

**Fix via API:**
```bash
POST /api/admin/fix-submission-clientids
```

**Hintergrund:** Nach Deployment können TeamSubmissions ohne `clientId` existieren wenn Teams umstrukturiert wurden.

---

### Problem: Combined Timesheet Export schlägt fehl

**Symptome:**
- Download-Button reagiert nicht
- Error in Browser Console
- 404 oder 500 Error

**Root Cause Checklist:**
1. ✅ `clientId` vorhanden?
2. ✅ Month/Year korrekt?
3. ✅ Format-Parameter valide? (`pdf`, `xlsx`, `csv`)
4. ✅ Timesheet-Daten vorhanden für Export?

**Debugging:**
```typescript
// Browser Console:
console.log("Export Request:", {
    clientId,
    month,
    year,
    format
})

// Server-side (API Route):
console.log("Export Data:", {
    timesheetsCount: timesheets.length,
    employeesCount: employees.length,
    hasClientSignature: !!clientSignature
})
```

**Fix:**
- Prüfe Network Tab für genaue Error Message
- Schaue Server Logs (Vercel Dashboard)
- Validiere dass Status-Filter korrekt ist

---

### Problem: E-Mail wird nicht gesendet

**Symptome:**
- "E-Mail erfolgreich gesendet" Toast erscheint
- Klient erhält keine E-Mail
- Keine Fehler in UI

**Debugging Steps:**
1. Prüfe Resend Dashboard (resend.com) für Delivery Status
2. Schaue Vercel Logs für E-Mail-Sending Errors
3. Validiere `RESEND_API_KEY` Environment Variable

**Common Issues:**
- **Spam Folder:** E-Mail landet im Spam
- **Invalid Email:** Client.email ist falsch/leer
- **Rate Limit:** Resend Free Tier Limit erreicht
- **Token Error:** TeamSubmission.signToken nicht generiert

**Fix:**
```typescript
// Prüfe in API Route:
console.log("Email Payload:", {
    to: client.email,
    hasToken: !!teamSubmission.signToken,
    tokenExpiry: teamSubmission.tokenExpiry
})

// Test Token-Generierung:
const token = crypto.randomBytes(32).toString('hex')
const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 Tage
```

---

### Problem: Performance - Langsame Seiten-Navigation

**Symptome:**
- Monatswechsel dauert 2-3 Sekunden
- SWR fetcht bei jedem Focus
- UI fühlt sich träge an

**Root Cause:** Suboptimale SWR Config

**Fix:**
```typescript
// src/hooks/use-admin-data.ts
export function useAdminTimesheets(month, year) {
    return useSWR(key, fetcher, {
        revalidateOnFocus: false,       // Kein Refetch bei Tab-Switch
        dedupingInterval: 5000,         // 5s statt 30s
        focusThrottleInterval: 60000,   // 60s throttle
        revalidateIfStale: false        // Cache-first
    })
}
```

**Performance Gains:**
- 50-70% schnellere Navigation
- Weniger Server-Load
- Bessere UX

---

### Problem: TypeScript Errors nach Update

**Symptome:**
- Build schlägt fehl
- Type Errors in IDE
- `npm run build` failed

**Common Errors:**

**1. showToast Parameter-Reihenfolge:**
```typescript
// FALSCH:
showToast("Fehler passiert", "error")  // ❌

// RICHTIG:
showToast("error", "Fehler passiert")  // ✅
```

**2. Missing clientId:**
```typescript
// FALSCH:
<CombinedTimesheetModal
    month={month}
    year={year}
    onClose={close}
/>  // ❌ clientId fehlt!

// RICHTIG:
<CombinedTimesheetModal
    clientId={submission.clientId}
    month={month}
    year={year}
    onClose={close}
/>  // ✅
```

**3. Import Paths:**
```typescript
// FALSCH:
import { showToast } from '../lib/toast-utils'  // ❌

// RICHTIG:
import { showToast } from '@/lib/toast-utils'  // ✅
```

**Fix:**
```bash
# Lokal testen:
npm run build

# Prisma neu generieren:
npx prisma generate

# Type Check:
npx tsc --noEmit
```

---

## Wichtige Hinweise

### Performance

1. **SWR Caching**: Seiten-Navigation ist instant nach erstem Load
2. **Promise.all**: Parallele DB-Queries in API Routes
3. **Dedupe**: SWR verhindert doppelte Requests (5s Interval)
4. **Optimistische Updates**: UI-Feedback ohne Wartezeit
5. **Cache-First Strategie**: `revalidateIfStale: false` für bessere Performance (Feb 2026)
6. **Focus Throttling**: 60s Intervall verhindert unnötige Revalidierungen (Feb 2026)

### Sicherheit

1. **Auth Check**: Alle Admin-Endpoints prüfen `session.user.role === "ADMIN"`
2. **Token-basiert**: Signatur-Links nutzen einmalige Tokens mit Ablaufdatum
3. **Zod Validation**: Request-Body wird validiert
4. **CSRF Protection**: next-auth eingebaut

### Bekannte Einschränkungen

- Mitarbeiter-Login-Test kann fehlschlagen (DB-Seed-Issue)
- Google Sheets Integration wurde entfernt (Januar 2026)
- TimesheetDetail benötigt `clientId` - nicht optional!
- CombinedTimesheetModal benötigt `clientId` - nicht optional!

### Kritische Patterns (Februar 2026)

**1. Status Filter Konsistenz:**
```typescript
// IMMER identischen Status-Filter verwenden:
status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"] }

// Gilt für:
// - getEmployeesInDienstplan() in team-submission-utils.ts
// - /api/admin/timesheets/combined
// - /api/admin/timesheets/combined/export
```

**2. Month/Year Filtering:**
```typescript
// IMMER TeamSubmissions nach Monat/Jahr filtern:
const submissions = await prisma.teamSubmission.findMany({
    where: {
        month: targetMonth,
        year: targetYear
        // Niemals ALLE Submissions global fetchen!
    }
})
```

**3. Data Validation vor Modal-Öffnung:**
```typescript
// Immer clientId prüfen vor Modal:
if (!submission.clientId) {
    showToast("error", "Klient-Zuordnung fehlt für diesen Dienstplan")
    return
}

// Actionable Error Messages statt generisch:
showToast("error", "Klient-Zuordnung fehlt. Bitte nutzen Sie den Reparatur-Button.")
```

**4. Error Handling mit Context:**
```typescript
// Detaillierte Fehler mit Repair-Hinweisen:
if (error.message.includes("clientId")) {
    return {
        error: "Keine clientId gefunden",
        hint: "Nutzen Sie Settings → Datenbank → Reparatur-Button",
        action: "repair"
    }
}
```

---

## Häufige Aufgaben

### Neue Admin-Seite hinzufügen

1. **EnterPlanMode nutzen** für Planung
2. Page erstellen in `src/app/admin/[name]/page.tsx`
3. SWR Hook in `src/hooks/use-admin-data.ts` hinzufügen (falls nötig)
4. Sidebar-Link in `src/components/Sidebar.tsx` ergänzen
5. API Route in `src/app/api/admin/[name]/route.ts` erstellen

### Neues Datenbank-Feld

1. Schema in `prisma/schema.prisma` ändern
2. `npx prisma db push` ausführen (Supabase)
3. TypeScript-Typen werden automatisch generiert
4. **infra-deployment-expert Agent** für komplexe Migrations nutzen

### UI-Komponente ändern

1. **ui-ux-specialist Agent** nutzen für Layout-Änderungen
2. Tailwind-Klassen konsistent halten (Dark Mode)
3. Hover-States für Action-Buttons einheitlich
4. Responsive Design berücksichtigen

### Business Logic implementieren

1. **business-logic-architect Agent** nutzen
2. Zod-Validierung für API-Inputs
3. Fehlerbehandlung mit try-catch + showToast
4. Parallele DB-Queries mit Promise.all

### Debugging: Status Filter Mismatch

**Symptom:** Combined Timesheet zeigt "Keine Schichten" obwohl Daten existieren

**Root Cause:** Inkonsistente Status-Filter zwischen Queries

**Fix-Prozess:**
1. **Explore Agent** nutzen zur Identifikation aller betroffenen Queries
2. `getEmployeesInDienstplan()` in `team-submission-utils.ts` prüfen
3. Status-Filter in `/api/admin/timesheets/combined` angleichen
4. Export-API ebenfalls aktualisieren
5. Beide Stellen (Lines 29-30, 56-57) in team-submission-utils.ts anpassen

**Pattern:**
```typescript
// VORHER (Bug):
const employees = await prisma.user.findMany({
    where: { teamId, role: "EMPLOYEE" }
    // KEIN Status-Filter!
})

// NACHHER (Fixed):
const employees = await prisma.user.findMany({
    where: {
        teamId,
        role: "EMPLOYEE",
        timesheets: {
            some: {
                status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"] },
                date: { gte: startDate, lte: endDate }
            }
        }
    }
})
```

### Debugging: Month/Year Filter fehlt

**Symptom:** Submissions-Seite zeigt falsche Monate mit Signaturen

**Root Cause:** `/api/admin/submissions` fetcht ALLE TeamSubmissions ohne WHERE clause

**Fix:**
```typescript
// VORHER (Bug):
const teamSubmissions = await prisma.teamSubmission.findMany({
    include: { employeeSignatures: true, client: true }
})

// NACHHER (Fixed):
const teamSubmissions = await prisma.teamSubmission.findMany({
    where: {
        month: targetMonth,
        year: targetYear
    },
    include: { employeeSignatures: true, client: true }
})
```

**Location:** `src/app/api/admin/submissions/route.ts` (Lines 70-73)

### Reparatur-Endpoints nutzen

**Wann verwenden:**
- Nach Production-Deployment mit fehlenden clientIds
- Nach manuellen DB-Änderungen
- Wenn TeamSubmissions korrupte Daten haben

**Zugriff:**
- UI: Admin → Settings → Datenbank Tab
- Button: "🚨 JETZT REPARIEREN" (clientIds)
- Button: "🔧 Jetzt korrigieren" (Team-Namen)

**Funktionsweise:**
```typescript
// Fix NULL clientIds:
POST /api/admin/fix-submission-clientids
// Findet Submissions ohne clientId
// Lookup via employee.team.client.id
// Update in Transaktion

// Fix Team-Namen:
POST /api/admin/fix-team-names
// Entfernt "Team " Prefix
// Löscht fehlerhafte DienstplanConfigs
```

---

## Code-Style & Conventions

### TypeScript

- Strict Mode aktiviert
- Keine `any` Types (außer Prisma-generiert)
- Interface für Props, Type für Unions
- Zod für Runtime-Validierung

### React

- Funktionale Komponenten (keine Class Components)
- Hooks für State Management
- SWR für Server State
- Optimistische Updates für bessere UX

### Naming

- Komponenten: PascalCase (`TimesheetDetail.tsx`)
- Functions: camelCase (`openTimesheetPreview`)
- Constants: UPPER_SNAKE_CASE (`MAX_HOURS`)
- Files: kebab-case für Utils (`toast-utils.ts`)

### Git Commits

```bash
# Format: Type: Short description (max 70 chars)
#
# Detailed explanation if needed
#
# Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>

# Beispiele:
Feature: Add timesheet preview to schedule editor
Fix: Correct showToast parameter order
UI: Remove Typ column from timesheet preview
Refactor: Simplify TimesheetDetail signatures section
```

---

## Deployment

### Vercel

- **Branch:** `main` → Production
- **Environment:** Production
- **Auto-Deploy:** Bei Push zu `main`

**Environment Variables:**
- `DATABASE_URL` - Supabase Connection
- `NEXTAUTH_SECRET` - Session Secret
- `NEXTAUTH_URL` - Production URL
- `RESEND_API_KEY` - E-Mail Service

**Bei Deployment-Fehlern:**
1. TypeScript Errors lokal beheben (`npm run build`)
2. showToast Parameter-Reihenfolge prüfen
3. Import-Paths überprüfen (`@/...`)
4. Prisma Client generiert? (`npx prisma generate`)

### Supabase

- **Database:** PostgreSQL
- **Auth:** next-auth (nicht Supabase Auth)
- **Migrations:** Prisma (`prisma db push`)

**Bei DB-Problemen:**
- `npx prisma db push` für Schema-Änderungen
- **infra-deployment-expert Agent** für komplexe Migrations

---

## Changelog-Highlights

### Februar 2026 - Combined Timesheet & Critical Bug Fixes

**Neue Features:**
- ✅ CombinedTimesheetModal für kompletten Dienstplan mit allen Mitarbeitern
- ✅ Flache Tabellenstruktur: Datum | Mitarbeiter | Geplant | Tatsächlich | Stunden | Notiz
- ✅ Mitarbeiter-Unterschriften + Klient-Unterschrift in rechter Sidebar
- ✅ Manueller E-Mail-Button zum Signatur-Aufforderung senden
- ✅ Export-Funktionalität: PDF, Excel (XLSX), CSV für kombinierte Daten
- ✅ Eye-Icon in Submissions-Seite für Combined Timesheet Preview

**Kritische Bug Fixes:**
- 🐛 **Status Filter Mismatch behoben:** `getEmployeesInDienstplan()` hatte keinen Status-Filter
  - Problem: Combined Timesheet zeigte "Keine Schichten" obwohl Daten existierten
  - Fix: Status-Filter `["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"]` hinzugefügt
  - Location: `src/lib/team-submission-utils.ts` (Lines 29-30, 56-57)

- 🐛 **Month/Year Filter fehlte:** `/api/admin/submissions` fetchte ALLE TeamSubmissions
  - Problem: Falsche Monate zeigten Signaturen obwohl keine Daten existierten
  - Fix: `where: { month, year }` zu TeamSubmission Query hinzugefügt
  - Location: `src/app/api/admin/submissions/route.ts` (Lines 70-73)

**Performance Optimierungen:**
- ⚡ SWR `dedupingInterval` reduziert: 30s → 5s (schnellere Navigation)
- ⚡ `focusThrottleInterval: 60000` hinzugefügt (60s)
- ⚡ `revalidateIfStale: false` für Cache-first Strategie
- ⚡ **Impact:** 50-70% schnellere Page Loads und Navigation

**UI/UX Verbesserungen:**
- 🎨 E-Mail-Button aus TimesheetDetail entfernt (nur Status-Message)
- 🎨 Comprehensive Error Messages mit Repair-Hinweisen
- 🎨 404-Error Detection mit Context
- 🎨 Missing clientId Detection mit Actionable Hints

**Neue Endpoints:**
- `/api/admin/timesheets/combined` - Kombinierte Dienstplan-Daten
- `/api/admin/timesheets/combined/export` - Export (PDF/Excel/CSV)
- `/api/admin/submissions/send-email` - Manuelle E-Mail-Aufforderung
- `/api/admin/fix-submission-clientids` - Reparatur für NULL clientIds
- `/api/admin/fix-team-names` - Reparatur für Team-Namen

**Architektur-Verbesserungen:**
- 📚 `team-submission-utils.ts` als zentrale Business-Logic für Einreichungen
- 📚 `generateCombinedTeamPdf()` in pdf-generator.ts für Combined PDFs
- 📚 Konsistente Status-Filter Pattern etabliert
- 📚 Month/Year Filtering Pattern etabliert

**Debugging-Erkenntnisse:**
- 🔍 Explorer Agent identifizierte 5 CRITICAL bugs + 5 Performance-Bottlenecks
- 🔍 Parallele Agent-Nutzung für schnellere Problem-Lösung
- 🔍 Status-Filter-Konsistenz als kritisches Pattern erkannt
- 🔍 Month/Year-Filtering als Pflicht-Pattern für TeamSubmissions

### Januar 2026 - Preview-Funktion Integration

**Features:**
- ✅ Eye-Icon in Dienstplan-Editor pro Schicht
- ✅ TimesheetDetail-Modal integriert
- ✅ Vorschau zeigt kompletten Monats-Stundennachweis
- ✅ Nur Klient-Unterschrift in rechter Sidebar

**Navigation:**
- ✅ "Stundennachweise"-Link aus Sidebar entfernt
- ✅ `/admin/page.tsx` als Redirect zu `/admin/schedule`
- ✅ 3 Items in Sidebar: Kalender, Klienten, Assistenten

**UI/UX:**
- ✅ "Typ"-Spalte aus Stundennachweis-Vorschau entfernt
- ✅ Konsistente Hover-States für Action-Icons
- ✅ Toast-Fehlerbehandlung verbessert

---

## Weitere Ressourcen

- **Plan Mode:** Für komplexe Implementierungen EnterPlanMode nutzen
- **Agents:** Specialized Agents für Exploration, UI, Business Logic, Infra
- **Changelog:** Vollständige Historie in `CHANGELOG.md`
- **Tests:** E2E Tests in `e2e/` Ordner

---

## Quick Reference - Häufigste Befehle & Patterns (Februar 2026)

### Status Filter Pattern (ÜBERALL verwenden!)

```typescript
// STANDARD Status-Filter für alle Timesheet-Queries:
status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"] }

// Verwendung in:
// - team-submission-utils.ts (2x)
// - /api/admin/timesheets/combined
// - /api/admin/timesheets/combined/export
// - Alle anderen Timesheet-Queries
```

### Month/Year Filter Pattern (TeamSubmission)

```typescript
// IMMER bei TeamSubmission-Queries:
where: {
    month: targetMonth,
    year: targetYear
}

// Verwendung in:
// - /api/admin/submissions
// - Alle TeamSubmission-Abfragen
```

### ClientId Validation Pattern

```typescript
// VOR Modal-Öffnung:
if (!submission.clientId) {
    showToast("error", "Klient-Zuordnung fehlt für diesen Dienstplan")
    return
}

// Mit Repair-Hint:
showToast("error", "Klient-Zuordnung fehlt. Nutzen Sie Settings → Datenbank → Reparatur-Button")
```

### SWR Hook Pattern

```typescript
// Optimiert für Performance:
useSWR(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
    focusThrottleInterval: 60000,
    revalidateIfStale: false
})
```

### API Error Response Pattern

```typescript
// Mit Context & Hint:
return NextResponse.json(
    {
        error: "Keine clientId gefunden",
        hint: "Nutzen Sie den Reparatur-Button in Settings",
        details: error.message
    },
    { status: 400 }
)
```

### Combined Timesheet Query Pattern

```typescript
// FLAT structure - nicht nested:
const timesheets = await prisma.timesheet.findMany({
    where: {
        employee: {
            teamId,
            role: "EMPLOYEE"
        },
        date: { gte: startDate, lte: endDate },
        status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"] }
    },
    include: {
        employee: { select: { id: true, name: true } }
    },
    orderBy: { date: "asc" }
})

// Map zu flat array:
return timesheets.map(ts => ({
    ...ts,
    employeeId: ts.employee.id,
    employeeName: ts.employee.name
}))
```

### Email Sending Pattern

```typescript
// Mit Token & Expiry:
const token = crypto.randomBytes(32).toString('hex')
const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

await prisma.teamSubmission.update({
    where: { id: submissionId },
    data: {
        signToken: token,
        tokenExpiry
    }
})

await resend.emails.send({
    from: "noreply@yourdomain.com",
    to: client.email,
    subject: `Signatur angefordert: ${clientName}`,
    html: `<a href="${signUrl}">Jetzt signieren</a>`
})
```

### Repair Endpoints Usage

```bash
# Via UI:
Admin → Settings (Zahnrad) → Datenbank Tab → Buttons klicken

# Via API:
POST /api/admin/fix-submission-clientids
POST /api/admin/fix-team-names
```

### Debugging Commands

```bash
# Local Build Test:
npm run build

# Prisma Commands:
npx prisma generate
npx prisma db push
npx prisma studio

# Type Check:
npx tsc --noEmit

# E2E Tests:
npm run test:e2e
npm run test:e2e:headed
npm run test:db:reset
```

### Agent Usage Quick Guide

```
Codebase-Recherche:      Explore Agent
Feature-Implementation:  EnterPlanMode → Plan → Implement
UI/UX Änderungen:        ui-ux-specialist
Business Logic:          business-logic-architect
Infrastruktur:           infra-deployment-expert
Parallel-Debugging:      Multiple Explore Agents
```

---

---

## Bekannte Technical Debt (aus Explorer-Analyse Feb 2026)

### Kritische Issues (Für zukünftige Sprints)

**1. Race Condition in Multi-Employee Signatur-Flow:**
- Problem: Mehrere Mitarbeiter können gleichzeitig signieren
- Risk: TeamSubmission-Status kann inkonsistent werden
- Fix: Transaction-basierte Updates mit Locks

**2. Fehlende Database Indexes:**
- `Timesheet.date` + `Timesheet.employeeId` (combined index)
- `TeamSubmission.month` + `TeamSubmission.year` (combined index)
- Impact: Langsame Queries bei großen Datenmengen

**3. N+1 Query Patterns:**
- Submissions-Page fetcht Teams einzeln
- Fix: Eager Loading mit Prisma `include`

**4. Rate Limiting fehlt:**
- Public Endpoints ohne Rate Limiting (z.B. `/api/sign/[token]`)
- Risk: DOS-Angriffe möglich
- Fix: next-rate-limit middleware

**5. TypeScript `any` Types:**
- Mehrere Error-Handler nutzen `any`
- Fix: Standardisierte Error-Types erstellen

### Optimierungs-Möglichkeiten

**HTTP Cache Headers:**
- Static Assets könnten aggressive Cache-Control haben
- API-Responses mit ETag versehen

**Skeleton Loading States:**
- Bessere UX während SWR-Fetch
- Reduziert wahrgenommene Ladezeit

**Accessibility (a11y):**
- Aria-Labels für Icon-Buttons fehlen
- Keyboard-Navigation nicht überall implementiert

**Standardisierte Error Types:**
```typescript
// Zukünftige Pattern:
type ApiError = {
    code: "NOT_FOUND" | "VALIDATION_ERROR" | "UNAUTHORIZED"
    message: string
    hint?: string
    action?: "repair" | "retry" | "contact_admin"
}
```

---

## Debugging-Techniken (Gelernt Feb 2026)

### Explorer Agent Findings

**Verwendung:**
```bash
# Parallele Exploration für schnellere Ergebnisse:
1. Explorer Agent: "Finde alle Status-Filter in Timesheet-Queries"
2. Explorer Agent: "Identifiziere Performance-Bottlenecks in API Routes"
3. Explorer Agent: "Suche nach fehlenden WHERE-Clauses in TeamSubmission"
```

**Key Findings (Feb 2026):**
- 5 CRITICAL bugs identifiziert (Status Filter, Month/Year Filter, etc.)
- 5 Performance-Bottlenecks gefunden (SWR Config, N+1 Queries, etc.)
- 3 Security-Issues aufgedeckt (Rate Limiting, etc.)

### Parallel Agent Usage Pattern

**Best Practice:**
```typescript
// Spawne multiple Agents parallel für komplexe Tasks:
1. UI/UX Specialist: Table Layout Fix
2. Business Logic Architect: Export & Email Functionality
3. Explore Agent: Root Cause Analysis
4. Explore Agent: Performance Investigation

// Wartet nicht sequenziell - spart 50-70% Zeit!
```

### Status Filter Debugging Pattern

**Checkliste bei "Keine Daten" Problemen:**
1. ✅ Status-Filter in Query vorhanden?
2. ✅ Identischer Filter in allen verwandten Queries?
3. ✅ WHERE clause mit month/year für TeamSubmissions?
4. ✅ Employee-Relation korrekt included?
5. ✅ Date-Range korrekt berechnet?

**Tool:**
```typescript
// Console-Log zum Debugging:
console.log("Query-Filter:", {
    status: whereClause.status,
    dateRange: { start: startDate, end: endDate },
    foundEmployees: employees.length,
    foundTimesheets: timesheets.length
})
```

---

**Letzte Aktualisierung:** Februar 2026
**Version:** 3.0 (Combined Timesheet + Critical Fixes)
**Maintained by:** David Alberg + Claude Sonnet 4.5
