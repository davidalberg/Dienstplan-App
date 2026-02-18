# Dienstplan-App - Claude Code Dokumentation

## Agents verwenden!

**Nutze Agenten-Teams wenn es Sinn macht für beste Resultate.** Bei klaren, kleinen Änderungen (2-3 Dateien, Plan steht) direkt arbeiten. Bei komplexen Tasks, unklaren Anforderungen oder großflächigen Änderungen Agenten einsetzen.

| Szenario | Agent |
|----------|-------|
| Codebase erkunden | `Explore` |
| Feature implementieren | `EnterPlanMode` → Plan → Implement |
| Business Logic | `business-logic-architect` |
| UI/UX | `ui-ux-specialist` |
| Infrastruktur | `infra-deployment-expert` |

---

## Bug-Fixing Workflow

**WICHTIG:** Bei Bug-Reports nicht sofort mit der Behebung beginnen!

1. **Zuerst:** Test schreiben, der den Bug reproduziert
2. **Dann:** Subagenten den Bug beheben lassen
3. **Verifizieren:** Test muss grün werden

```bash
# Beispiel-Workflow
npm run test:e2e -- --grep "bug-description"  # Test schreiben & ausführen (rot)
# → Fix implementieren
npm run test:e2e -- --grep "bug-description"  # Test verifizieren (grün)
```

---

## MCP-Server (Model Context Protocol)

Verfügbare MCP-Server für erweiterte Funktionalität:

| Server | Zweck | Verwendung |
|--------|-------|------------|
| `supabase` | Datenbank-Queries, Schema-Inspektion | DB-Debugging, Migrations |
| `playwright` | Browser-Automation, E2E-Tests | Testing, Screenshots |
| `github` | PRs, Issues, Repository-Management | Code-Reviews, CI/CD |
| `filesystem` | Erweiterte Dateioperationen | Batch-Verarbeitung |
| `memory` | Persistentes Projekt-Gedächtnis | Kontext speichern |
| `vercel` | Deployments, Logs, Projekt-Verwaltung | Deployment-Debugging |

### MCP-Server starten
Die Server werden automatisch gestartet wenn sie in `.claude/settings.json` konfiguriert sind.

### Umgebungsvariablen erforderlich
- `SUPABASE_URL` - Supabase Projekt-URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service Role Key
- `GITHUB_TOKEN` - GitHub Personal Access Token (für github MCP)

---

## Projekt-Übersicht

**Stundennachweis-App für Assistenzdienste** mit Schichtplanung, digitalen Signaturen, PDF/Excel/CSV-Export.

**Tech Stack:** Next.js 15.5, React 18, TypeScript, Prisma 6.2, PostgreSQL (Supabase), Tailwind CSS 4 (Dark Mode), SWR, next-auth 5.0 beta, Playwright

---

## Projektstruktur (Kurzfassung)

```
src/
├── app/
│   ├── admin/           # schedule/, clients/, assistants/, submissions/
│   ├── api/admin/       # timesheets/, schedule/, submissions/, employees/
│   ├── dashboard/       # Mitarbeiter-Dashboard
│   └── sign/[token]/    # Signatur-Seite
├── components/          # Sidebar, TimesheetDetail, CombinedTimesheetModal, SignaturePad
├── hooks/use-admin-data.ts  # SWR Hooks
└── lib/                 # auth, prisma, pdf-generator, email, toast-utils, team-submission-utils
```

---

## Datenbank-Modelle

| Model | Beschreibung |
|-------|-------------|
| `User` | Mitarbeiter/Admin |
| `Team` | Team mit Client-Zuordnung |
| `Client` | Assistenznehmer |
| `Timesheet` | Schicht (geplant/tatsächlich) |
| `TeamSubmission` | Monats-Einreichung |
| `EmployeeSignature` | Mitarbeiter-Unterschrift |

**Relationen:** User → Team → Client | Timesheet → User | TeamSubmission → EmployeeSignature

---

## Kritische Patterns

### 1. Status-Filter (IMMER identisch verwenden!)
```typescript
status: { in: ["PLANNED", "CONFIRMED", "CHANGED", "SUBMITTED"] }
```

### 2. Month/Year-Filter (TeamSubmission)
```typescript
where: { month: targetMonth, year: targetYear }
```

### 3. clientId-Validierung vor Modal
```typescript
if (!submission.clientId) {
    showToast("error", "Klient-Zuordnung fehlt")
    return
}
```

### 4. showToast Reihenfolge
```typescript
showToast("error", "Nachricht")  // ✅ type zuerst!
showToast("success", "Fertig")
```

### 5. SWR Config (Performance)
```typescript
{ revalidateOnFocus: false, dedupingInterval: 5000, focusThrottleInterval: 60000, revalidateIfStale: false }
```

---

## API Endpoints

### Admin (ADMIN-Rolle erforderlich)
| Endpoint | Methoden | Beschreibung |
|----------|----------|--------------|
| `/api/admin/timesheets` | GET | Dashboard-Daten |
| `/api/admin/timesheets/combined` | GET | Kombinierte Dienstplan-Daten |
| `/api/admin/timesheets/combined/export` | GET | Export (PDF/XLSX/CSV) |
| `/api/admin/schedule` | GET,POST,PUT,DELETE | Schicht-CRUD |
| `/api/admin/submissions` | GET | Einreichungen (mit month/year!) |
| `/api/admin/submissions/detail` | GET | Stundennachweis-Details |
| `/api/admin/submissions/send-email` | POST | E-Mail an Klient |
| `/api/admin/employees` | GET,PUT,DELETE | Mitarbeiter-CRUD |
| `/api/clients` | GET,POST,PUT,DELETE | Klienten-CRUD |

### Mitarbeiter
| Endpoint | Methoden |
|----------|----------|
| `/api/timesheets` | GET,PUT |
| `/api/timesheets/submit` | POST |
| `/api/sign/[token]` | GET,POST |

---

## Wichtige Komponenten

### TimesheetDetail (Einzelner Mitarbeiter)
```typescript
<TimesheetDetail employeeId={id} clientId={clientId} month={m} year={y} onClose={fn} />
```

### CombinedTimesheetModal (Kompletter Dienstplan)
```typescript
<CombinedTimesheetModal clientId={id} month={m} year={y} onClose={fn} />
```

**Combined API Response:** Flat structure!
```typescript
{ timesheets: [{ employeeId, employeeName, date, hours, ... }], employees: [{ id, name, totalHours }], client, clientSignature, stats }
```

---

## Styling (Dark Mode)

| Element | Klassen |
|---------|---------|
| Hintergrund | `bg-neutral-950` |
| Cards | `bg-neutral-900` |
| Inputs | `bg-neutral-800 border-neutral-700` |
| Text | `text-white` / `text-neutral-400` |
| Akzent | `text-violet-400`, `bg-violet-600` |
| Hover | `hover:text-violet-400 hover:bg-violet-900/30` |

---

## Troubleshooting

### "Keine Schichten" obwohl Daten existieren
**Ursache:** Status-Filter Mismatch in `team-submission-utils.ts`
**Fix:** Identischen Filter in beiden Funktionen verwenden

### Falsche Monate zeigen Signaturen
**Ursache:** Month/Year Filter fehlt in `/api/admin/submissions`
**Fix:** `where: { month, year }` hinzufügen

### "Klient-Zuordnung fehlt"
**Ursache:** NULL clientId in TeamSubmission
**Fix:** Admin → Settings → Datenbank → Reparatur-Button

---

## Befehle

```bash
npm run build           # Build testen
npm run test:e2e        # E2E Tests
npx prisma generate     # Prisma Client
npx prisma db push      # Schema deployen
npx tsc --noEmit        # Type Check
```

---

## Deployment

**Vercel:** Auto-Deploy bei Push zu `main`
**Environment:** DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, RESEND_API_KEY
**Supabase:** PostgreSQL mit Prisma

---

## Code Conventions

- Komponenten: PascalCase
- Functions: camelCase
- Constants: UPPER_SNAKE_CASE
- Imports: `@/lib/...`
- Commits: `Type: Description` + Co-Authored-By

---

## Abwesenheits-System (Urlaub / Krank)

### Übersicht
- **Dienstplan-Editor** (`/admin/schedule`): Dropdown "Abwesenheitstyp" bei Schicht-Erstellung/Bearbeitung
  - Optionen: Normal (Arbeit), Urlaub, Krank
  - Feld: `Timesheet.absenceType` = `"VACATION"` | `"SICK"` | `null`

- **Abwesenheits-Übersicht** (`/admin/vacations`): Zeigt alle Urlaub/Krank-Einträge aus Dienstplan
  - Gruppiert nach Mitarbeiter
  - Filter: Alle / Urlaub / Krank
  - Statistik: Tage und Stunden pro Typ
  - API: `/api/admin/vacations/absences?month=X&year=Y`

- **Urlaubs-App** (extern): https://urlaubs-app.vercel.app/
  - Separate App für detaillierte Urlaubsberechnung (Resturlaub, Auszahlung)
  - Button in der Abwesenheits-Übersicht verlinkt dorthin
  - **KEINE automatische Synchronisation** - manuell eintragen!

### Wichtig
- Urlaubsberechnung: 6 Werktage/Woche, 28 Urlaubstage/Jahr pro Person
- Firebase-Sync wurde entfernt (war nicht stabil) - später neu implementieren
- Sidebar: "Urlaub / Krank" (nicht nur "Urlaub")

---

## Verwandte Projekte

| Projekt | Pfad | Beschreibung |
|---------|------|--------------|
| Dienstplan-App | `C:\Users\david\Desktop\Stundennachweis_App\Dienstplan-App` | Diese App |
| Urlaubs-App | `C:\Users\david\Desktop\Urlaubsapp` | Urlaubsberechnung (React/Vite/Firebase) |

---

**Version:** 3.2 | **Updated:** 02. Februar 2026
