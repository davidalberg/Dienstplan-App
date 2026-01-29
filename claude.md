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
- PDF-Export der Stundennachweise (ohne "Typ"-Spalte)
- Multi-Team-Verwaltung

**Aktuelle Version:** Januar 2026
**Letztes Update:** Januar 2026 - Preview-Funktion, Sidebar-Vereinfachung

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
│   ├── Sidebar.tsx         # Admin Navigation (3 Items: Kalender, Klienten, Assistenten)
│   ├── SignaturePad.tsx    # Unterschrift-Canvas
│   ├── TimesheetDetail.tsx # Stundennachweis-Vorschau Modal (WICHTIG!)
│   ├── SubmitModal.tsx     # Einreichungs-Modal für Mitarbeiter
│   └── ...
├── hooks/
│   └── use-admin-data.ts   # SWR Hooks für Admin-Seiten
├── lib/
│   ├── auth.ts             # next-auth Konfiguration
│   ├── prisma.ts           # Prisma Client
│   ├── pdf-generator.ts    # jsPDF Stundennachweis
│   ├── email.ts            # Resend E-Mail-Versand
│   ├── time-utils.ts       # Zeit-Berechnungen
│   ├── toast-utils.ts      # Toast Helper (showToast)
│   └── premium-calculator.ts # Zuschlagsberechnung
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
// src/hooks/use-admin-data.ts
export function useAdminTimesheets(month, year, employeeId?, teamId?) {
    return useSWR(`/api/admin/timesheets?...`, fetcher, {
        revalidateOnFocus: false,
        dedupingInterval: 5000
    })
}
```

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
| `/api/admin/schedule` | GET, POST, PUT, DELETE | Schicht-Management |
| `/api/admin/submissions` | GET | Einreichungen mit Status |
| `/api/admin/submissions/detail` | GET | Vollständiger Stundennachweis für TimesheetDetail |
| `/api/admin/employees` | GET, PUT, DELETE | Mitarbeiter-CRUD |
| `/api/clients` | GET, POST, PUT, DELETE | Klienten-CRUD |

### Mitarbeiter Endpoints

| Endpoint | Methoden | Beschreibung |
|----------|----------|--------------|
| `/api/timesheets` | GET, PUT | Eigene Schichten |
| `/api/timesheets/submit` | POST | Monat einreichen |
| `/api/sign/[token]` | GET, POST | Signatur-Seite |

### Detail API für TimesheetDetail

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

### Preview-Funktion im Dienstplan-Editor

**Eye-Icon pro Schicht:**
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

## Wichtige Hinweise

### Performance

1. **SWR Caching**: Seiten-Navigation ist instant nach erstem Load
2. **Promise.all**: Parallele DB-Queries in API Routes
3. **Dedupe**: SWR verhindert doppelte Requests (5s Interval)
4. **Optimistische Updates**: UI-Feedback ohne Wartezeit

### Sicherheit

1. **Auth Check**: Alle Admin-Endpoints prüfen `session.user.role === "ADMIN"`
2. **Token-basiert**: Signatur-Links nutzen einmalige Tokens mit Ablaufdatum
3. **Zod Validation**: Request-Body wird validiert
4. **CSRF Protection**: next-auth eingebaut

### Bekannte Einschränkungen

- Mitarbeiter-Login-Test kann fehlschlagen (DB-Seed-Issue)
- Google Sheets Integration wurde entfernt (Januar 2026)
- TimesheetDetail benötigt `clientId` - nicht optional!

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

## Changelog-Highlights (Januar 2026)

### Preview-Funktion Integration

- ✅ Eye-Icon in Dienstplan-Editor pro Schicht
- ✅ TimesheetDetail-Modal integriert
- ✅ Vorschau zeigt kompletten Monats-Stundennachweis
- ✅ Nur Klient-Unterschrift in rechter Sidebar

### Navigation Vereinfachung

- ✅ "Stundennachweise"-Link aus Sidebar entfernt
- ✅ `/admin/page.tsx` als Redirect zu `/admin/schedule`
- ✅ 3 Items in Sidebar: Kalender, Klienten, Assistenten

### UI/UX Verbesserungen

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

**Letzte Aktualisierung:** Januar 2026
**Version:** 2.0 (Preview-Integration)
**Maintained by:** David Alberg + Claude Sonnet 4.5
