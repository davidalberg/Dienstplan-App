# AssistenzPlus Stundennachweis App

Produktionsbereiter MVP für die Zeiterfassung und Google Sheets Synchronisierung.

## Technologie Stack
- **Frontend**: Next.js 15 (App Router), Tailwind CSS
- **Backend**: Next.js Route Handlers
- **Datenbank**: PostgreSQL mit Prisma ORM
- **Authentifizierung**: Auth.js (NextAuth v5)
- **Integration**: Google Sheets API

## Voraussetzungen
- Node.js 18+
- PostgreSQL Instanz
- Google Service Account (für Sheets Sync)

## Installation

1. **Repository klonen & Abhängigkeiten installieren**
   ```bash
   npm install
   ```

2. **Umgebungsvariablen konfigurieren**
   Erstelle eine `.env` Datei basierend auf `.env.example`:
   ```env
   DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DB?schema=public"
   AUTH_SECRET="generiere-einen-zufälligen-string"
   
   # Google Sheets (Optional für lokale Entwicklung)
   GOOGLE_CLIENT_EMAIL="service-account@project.iam.gserviceaccount.com"
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   GOOGLE_SHEET_ID="deine-sheet-id"
   ```

3. **Datenbank Setup**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Demo Daten laden (Seed)**
   ```bash
   npm run seed
   ```

5. **Entwicklungsmodus starten**
   ```bash
   npm run dev
   ```

## Rollen im System
- **Employee**: `yusuf.agca@assistenzplus.de` / `password123`
- **Teamlead**: `personal@assistenzplus.de` / `password123`
- **Admin**: `david.alberg@assistenzplus.de` / `password123`

## Projektstruktur
- `src/app`: Next.js App Router Seiten und API Routes.
- `src/components`: Wiederverwendbare UI Komponenten.
- `src/lib`: Bibliotheken (Prisma, Auth, Google Sheets).
- `prisma/`: Datenbank Schema und Seed Skript.
- `legacy_prototype/`: Archivierter ursprünglicher Prototyp.
# Build trigger
