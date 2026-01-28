# Changelog

Alle wichtigen Änderungen an diesem Projekt werden hier dokumentiert.

---

## [Unreleased]

### Hinzugefügt
- `claude.md` Projektdokumentation für Claude Code Sessions
- `CHANGELOG.md` für Versionshistorie
- Aktivitätsprotokoll-Seite unter Einstellungen (geplant)

---

## [2026-01-28] - Performance & Dark Mode

### Hinzugefügt
- **SWR Caching** für alle Admin-Seiten (`src/hooks/use-admin-data.ts`)
  - `useAdminTimesheets()` - Dashboard
  - `useAdminSchedule()` - Dienstplan
  - `useAdminSubmissions()` - Einreichungen
  - `useClients()` - Klienten
  - `useAdminEmployees()` - Assistenten
- Instant Navigation zwischen Admin-Seiten (< 100ms nach erstem Load)

### Geändert
- **Dienstplan-Editor** (`src/app/admin/schedule/page.tsx`)
  - Dark Mode Design (neutral-900/950 Palette)
  - Kompaktere Spalten
  - Verbesserte Übersichtlichkeit
- **API Routes** - Parallele DB-Abfragen mit `Promise.all()`
  - `/api/admin/timesheets` - von ~700ms auf ~300ms
  - `/api/admin/schedule` - von ~700ms auf ~300ms
  - `/api/admin/submissions` - von ~700ms auf ~300ms

### Performance
- Seitennavigation: von 1-2 Sekunden auf instant (SWR Cache)
- API Response Time: ~50% schneller durch parallele Queries

---

## [2026-01-27] - Dienstplan-Editor Kalender

### Hinzugefügt
- Dienstplan-Editor mit Kalender- und Listen-Ansicht
- Schicht-Erstellung per Drag & Click
- Bulk-Erstellung (Wiederholende Schichten)

### Geändert
- Backup-Schicht wird gelöscht wenn Backup sich krank meldet

---

## [2026-01-26] - Mitarbeiter-Verwaltung

### Hinzugefügt
- Urlaubstage & Krankheitstage in Mitarbeiter-Verwaltung
- Zeitanzeige im Admin Schicht-Management (0:00 → 24:00)

---

## [2026-01-25] - Google Sheets Entfernung

### Entfernt
- Google Sheets Integration komplett entfernt
- Alle Daten werden jetzt in Supabase PostgreSQL gespeichert

### Hinzugefügt
- Umfangreiche E2E Tests (101 Tests)
- Playwright Test-Suite für Admin-Bereich

---

## [2026-01-20] - Multi-Employee Signaturen

### Hinzugefügt
- `TeamSubmission` Model für team-basierte Einreichungen
- `EmployeeSignature` Model für individuelle Unterschriften
- `DienstplanConfig` für Dienstplan-spezifische Einstellungen

### Geändert
- Einreichungs-Workflow unterstützt jetzt mehrere Mitarbeiter pro Dienstplan

---

## [2026-01-15] - Klienten-Verwaltung

### Hinzugefügt
- Klienten-Seite (`/admin/clients`)
- CRUD für Klienten mit Bundesland-Auswahl
- Team-zu-Klient Zuordnung

---

## [2026-01-10] - Initiale Version

### Hinzugefügt
- Next.js 15 App Router Setup
- Prisma mit Supabase PostgreSQL
- Admin Dashboard
- Mitarbeiter-Dashboard
- Signatur-System (Token-basiert)
- PDF-Export für Stundennachweise
- E-Mail-Versand via Resend

---

## Migrationshinweise

### Von Google Sheets zu Supabase
Die Migration wurde am 25.01.2026 abgeschlossen. Alle Timesheet-Daten wurden in die PostgreSQL-Datenbank überführt. Die `source` Spalte in Timesheets zeigt die Herkunft:
- `APP` - In der App erstellt
- `SHEETS` - Aus Google Sheets importiert (Legacy)
