# Dienstplan-App - Claude Code Dokumentation

## Projektübersicht

Eine Stundennachweis- und Dienstplan-Management-Anwendung für Assistenzdienste. Ermöglicht:
- Schicht-Planung und -Verwaltung
- Stundenerfassung durch Mitarbeiter
- Digitale Signaturen für Assistenten und Assistenznehmer
- PDF-Export der Stundennachweise
- Multi-Team-Verwaltung

---

## Tech Stack

| Technologie | Version | Verwendung |
|------------|---------|------------|
| Next.js | 15.5+ | App Router, API Routes |
| React | 18.3 | Frontend |
| TypeScript | 5.x | Typisierung |
| Prisma | 6.2+ | ORM |
| PostgreSQL | - | Datenbank (Supabase) |
| Tailwind CSS | 4.x | Styling (Dark Mode) |
| SWR | 2.3+ | Client-side Caching |
| next-auth | 5.0 beta | Authentifizierung |
| Playwright | 1.58+ | E2E Tests |

---

## Projektstruktur

```
src/
├── app/
│   ├── admin/              # Admin-Bereich
│   │   ├── page.tsx        # Dashboard (Stundenübersicht)
│   │   ├── schedule/       # Dienstplan-Editor
│   │   ├── submissions/    # Einreichungen & Signaturen
│   │   ├── clients/        # Klienten-Verwaltung
│   │   ├── assistants/     # Assistenten-Verwaltung
│   │   └── employees/      # (Legacy, durch assistants ersetzt)
│   ├── api/
│   │   ├── admin/          # Admin API Endpoints
│   │   │   ├── timesheets/ # GET: Dashboard-Daten
│   │   │   ├── schedule/   # CRUD: Schichten
│   │   │   ├── submissions/# Einreichungs-Management
│   │   │   └── employees/  # Mitarbeiter-CRUD
│   │   ├── clients/        # Klienten API
│   │   ├── timesheets/     # Mitarbeiter-Zeiterfassung
│   │   └── sign/           # Signatur-Token-Verifikation
│   ├── dashboard/          # Mitarbeiter-Dashboard
│   ├── login/              # Login-Seite
│   └── sign/[token]/       # Signatur-Seite (Token-basiert)
├── components/
│   ├── Sidebar.tsx         # Admin Navigation
│   ├── SignaturePad.tsx    # Unterschrift-Canvas
│   └── ...
├── hooks/
│   └── use-admin-data.ts   # SWR Hooks für Admin-Seiten
├── lib/
│   ├── auth.ts             # next-auth Konfiguration
│   ├── prisma.ts           # Prisma Client
│   ├── pdf-generator.ts    # jsPDF Stundennachweis
│   ├── email.ts            # Resend E-Mail-Versand
│   ├── time-utils.ts       # Zeit-Berechnungen
│   └── premium-calculator.ts # Zuschlagsberechnung
└── types/                  # TypeScript Definitionen
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

---

## API Endpoints

### Admin Endpoints (benötigen ADMIN Rolle)

| Endpoint | Methoden | Beschreibung |
|----------|----------|--------------|
| `/api/admin/timesheets` | GET | Dashboard-Daten |
| `/api/admin/schedule` | GET, POST, PUT, DELETE | Schicht-Management |
| `/api/admin/submissions` | GET | Einreichungen mit Status |
| `/api/admin/employees` | GET, PUT, DELETE | Mitarbeiter-CRUD |
| `/api/clients` | GET, POST, PUT, DELETE | Klienten-CRUD |

### Mitarbeiter Endpoints

| Endpoint | Methoden | Beschreibung |
|----------|----------|--------------|
| `/api/timesheets` | GET, PUT | Eigene Schichten |
| `/api/timesheets/submit` | POST | Monat einreichen |
| `/api/sign/[token]` | GET, POST | Signatur-Seite |

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

### Sicherheit

1. **Auth Check**: Alle Admin-Endpoints prüfen `session.user.role === "ADMIN"`
2. **Token-basiert**: Signatur-Links nutzen einmalige Tokens mit Ablaufdatum
3. **Zod Validation**: Request-Body wird validiert

### Bekannte Einschränkungen

- Mitarbeiter-Login-Test kann fehlschlagen (DB-Seed-Issue)
- Google Sheets Integration wurde entfernt (Januar 2026)

---

## Häufige Aufgaben

### Neue Admin-Seite hinzufügen

1. Page erstellen in `src/app/admin/[name]/page.tsx`
2. SWR Hook in `src/hooks/use-admin-data.ts` hinzufügen
3. Sidebar-Link in `src/components/Sidebar.tsx` ergänzen
4. API Route in `src/app/api/admin/[name]/route.ts` erstellen

### Neues Datenbank-Feld

1. Schema in `prisma/schema.prisma` ändern
2. `npx prisma db push` ausführen
3. TypeScript-Typen werden automatisch generiert

---

## Letzte Änderungen

Siehe [CHANGELOG.md](./CHANGELOG.md) für Versionshistorie.
