# Feature Implementation - Schicht-Duplizierung & Keyboard Shortcuts

## Übersicht

Zwei neue UI-Features wurden in den Dienstplan-Editor integriert:

1. **Schicht-Duplizierung** mit Copy-Icon und Modal
2. **Keyboard Shortcuts** für schnellere Navigation

---

## Feature 1: Schicht-Duplizierung

### Komponenten

**DuplicateShiftModal.tsx** (bereits vorhanden, wurde integriert)
- Location: `src/components/DuplicateShiftModal.tsx`
- Modal mit zwei Modi: Schnellauswahl und Benutzerdefiniert

### Integration in Schedule Page

**Neuer Button:**
- Icon: `Copy` (lucide-react)
- Position: Neben Eye, Edit, Delete Icons in der Aktionsspalte
- Hover-Style: `hover:text-green-400 hover:bg-green-900/30`
- Title: "Schicht duplizieren"

**Funktionalität:**
```typescript
// Öffnet Modal mit Schicht-Daten
const openDuplicateModal = (shift: Shift) => {
    setShiftToDuplicate(shift)
    setShowDuplicateModal(true)
}

// API-Call zum Duplizieren
const handleDuplicateShift = async (targetDate: string) => {
    // POST /api/admin/schedule mit gleichen Daten, neuem Datum
}
```

**Schnellauswahl-Optionen:**
- Nächste Woche (gleicher Wochentag)
- Nächsten Monat (gleiches Datum)
- Benutzerdefiniert (Date Picker)

**Kopierte Daten:**
- Mitarbeiter (employeeId)
- Geplante Zeiten (plannedStart, plannedEnd)
- Backup-Mitarbeiter (backupEmployeeId)
- Notizen (note)

---

## Feature 2: Keyboard Shortcuts

### Komponenten

**KeyboardShortcutsHelp.tsx** (bereits vorhanden, wurde integriert)
- Location: `src/components/KeyboardShortcutsHelp.tsx`
- Zeigt Liste aller Tastenkombinationen

**useKeyboardShortcuts Hook** (bereits vorhanden, wurde integriert)
- Location: `src/hooks/use-keyboard-shortcuts.ts`
- Verhindert Shortcuts während Texteingabe

### Implementierte Shortcuts

| Taste | Aktion |
|-------|--------|
| `N` | Neue Schicht erstellen |
| `ESC` | Aktuelles Modal schließen |
| `Ctrl+S` | Schicht speichern (wenn Modal offen) |
| `←` | Vorheriger Monat |
| `→` | Nächster Monat |
| `L` | Listen-Ansicht aktivieren |
| `C` | Kalender-Ansicht aktivieren |
| `?` | Tastenkombinationen-Hilfe anzeigen |

### Integration

**Hook-Initialisierung:**
```typescript
useKeyboardShortcuts({
    onNewShift: () => !showModal && openCreateModal(),
    onEscape: handleCloseModal,
    onSave: handleSaveShortcut,
    onPrevMonth: () => !showModal && navigateMonth(-1),
    onNextMonth: () => !showModal && navigateMonth(1),
    onListView: () => !showModal && setViewMode("list"),
    onCalendarView: () => !showModal && setViewMode("calendar"),
    onHelp: () => setShowShortcutsHelp(true)
}, true)
```

**First-Visit Toast:**
- Zeigt "Drücke '?' für Tastenkombinationen" nach 1,5 Sekunden
- Nur beim ersten Besuch (localStorage-Check)
- Verhindert wiederholte Anzeige

**Modal-Closing Logik:**
```typescript
// Intelligente Escape-Behandlung (von innen nach außen)
const handleCloseModal = useCallback(() => {
    if (showModal) setShowModal(false)
    else if (showShortcutsHelp) setShowShortcutsHelp(false)
    else if (showDuplicateModal) closeDuplicateModal()
    else if (showTimesheetDetail) closeTimesheetPreview()
}, [showModal, showShortcutsHelp, showDuplicateModal, showTimesheetDetail])
```

---

## Geänderte Dateien

### src/app/admin/schedule/page.tsx

**Neue Imports:**
```typescript
import { Copy } from "lucide-react"
import DuplicateShiftModal from "@/components/DuplicateShiftModal"
import KeyboardShortcutsHelp from "@/components/KeyboardShortcutsHelp"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
```

**Neuer State:**
```typescript
// Duplicate Modal
const [showDuplicateModal, setShowDuplicateModal] = useState(false)
const [shiftToDuplicate, setShiftToDuplicate] = useState<Shift | null>(null)

// Keyboard Shortcuts Help
const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)
const [hasSeenShortcutsTip, setHasSeenShortcutsTip] = useState(false)
```

**Neue Handler:**
```typescript
openDuplicateModal(shift: Shift)
closeDuplicateModal()
handleDuplicateShift(targetDate: string)
handleCloseModal()
handleSaveShortcut()
```

**UI-Änderungen:**
- Copy-Button in Aktionsspalte (Zeile ~940)
- DuplicateShiftModal am Ende (Zeile ~1370)
- KeyboardShortcutsHelp Modal am Ende (Zeile ~1380)

---

## Styling (Notion-Design)

### Copy-Button
```tsx
<button
    onClick={(e) => {
        e.stopPropagation()
        openDuplicateModal(shift)
    }}
    className="p-1.5 text-neutral-500 hover:text-green-400 hover:bg-green-900/30 rounded transition"
    title="Schicht duplizieren"
>
    <Copy size={14} />
</button>
```

**Design-Konsistenz:**
- Eye Icon: Violet (`hover:text-violet-400 hover:bg-violet-900/30`)
- Copy Icon: Green (`hover:text-green-400 hover:bg-green-900/30`)
- Edit Icon: Blue (`hover:text-blue-400 hover:bg-blue-900/30`)
- Delete Icon: Red (`hover:text-red-400 hover:bg-red-900/30`)

### Modals
- Dunkles Theme: `bg-neutral-900`
- Border: `border-neutral-800`
- Rounded Corners: `rounded-2xl`
- Violet Akzente: `bg-violet-600` für Primary Buttons

---

## Testing

### Manuelle Tests

**Schicht-Duplizierung:**
1. Öffne Dienstplan-Editor (`/admin/schedule`)
2. Klicke Copy-Icon neben einer Schicht
3. Teste "Nächste Woche" Option
4. Teste "Nächsten Monat" Option
5. Teste "Benutzerdefiniert" mit Date Picker
6. Verifiziere dass alle Daten korrekt kopiert wurden
7. Prüfe Toast-Benachrichtigungen

**Keyboard Shortcuts:**
1. Öffne Dienstplan-Editor
2. Drücke `?` → Hilfe-Modal erscheint
3. Drücke `ESC` → Modal schließt
4. Drücke `N` → Neue Schicht Modal öffnet
5. Drücke `ESC` → Modal schließt
6. Drücke `←` und `→` → Monatswechsel
7. Drücke `L` und `C` → View-Mode-Wechsel
8. Öffne Schicht-Modal, drücke `Ctrl+S` → Speichern
9. Teste dass Shortcuts in Input-Feldern deaktiviert sind

**First-Visit Toast:**
1. Öffne Browser Incognito Mode
2. Navigiere zu `/admin/schedule`
3. Nach 1,5 Sekunden sollte Toast erscheinen
4. Refresh Page → Toast sollte NICHT mehr erscheinen

### Edge Cases

**Duplicate Modal:**
- Schicht ohne Backup-Mitarbeiter
- Schicht ohne Notizen
- Zieldatum in der Vergangenheit
- Zieldatum überschneidet sich mit existierender Schicht

**Keyboard Shortcuts:**
- Modal offen + Input fokussiert → Shortcuts deaktiviert
- Mehrere Modals offen → ESC schließt oberste
- Schneller Tastendruck (Debouncing)

---

## Performance-Überlegungen

### useCallback Optimization
Alle Event-Handler sind mit `useCallback` optimiert:
- `handleCloseModal`
- `handleSaveShortcut`
- `handleCreateOrUpdate` (bereits vorhanden, jetzt memoized)

### Dependency Arrays
Korrekte Dependencies für alle useCallback/useEffect:
- `handleCloseModal`: `[showModal, showShortcutsHelp, showDuplicateModal, showTimesheetDetail]`
- `handleSaveShortcut`: `[showModal, handleCreateOrUpdate]`
- `handleCreateOrUpdate`: `[editingShift, formData, loading, fetchData]`

---

## API-Endpunkte

### Duplicate Shift
**Endpoint:** `POST /api/admin/schedule`

**Request Body:**
```json
{
  "employeeId": "string",
  "date": "2026-02-15",
  "plannedStart": "08:00",
  "plannedEnd": "16:00",
  "backupEmployeeId": "string | null",
  "note": "string | null"
}
```

**Response:**
```json
{
  "id": "string",
  "date": "2026-02-15",
  "plannedStart": "08:00",
  "plannedEnd": "16:00",
  "status": "PLANNED"
}
```

---

## Bekannte Limitierungen

1. **Duplicate ohne Konflikt-Prüfung:** Das Modal prüft nicht, ob am Zieldatum bereits eine Schicht existiert (API macht das)
2. **Keyboard Shortcuts nur in Schedule:** Andere Admin-Seiten haben keine Shortcuts
3. **Toast-Tip nur einmal:** Wird nicht mehr angezeigt nach localStorage-Flag

---

## Zukünftige Erweiterungen

### Mögliche Features:
- Bulk-Duplicate (mehrere Schichten gleichzeitig)
- Duplicate mit Anpassungen (Zeiten ändern im Modal)
- Keyboard Shortcuts in anderen Admin-Seiten
- Customizable Shortcuts (User-Einstellungen)
- Shortcut-Cheatsheet als Overlay (nicht Modal)

---

## Changelog

**2026-02-01 - Feature Implementation**
- Schicht-Duplizierung mit DuplicateShiftModal integriert
- Keyboard Shortcuts mit useKeyboardShortcuts Hook integriert
- Copy-Icon zu Aktionsspalte hinzugefügt
- First-Visit Toast für Shortcuts-Hilfe implementiert
- Alle Handler mit useCallback optimiert
- navigateMonth vor Hook-Aufruf verschoben (Function Order Fix)

---

## Datei-Referenzen

| Datei | Änderungen |
|-------|------------|
| `src/app/admin/schedule/page.tsx` | Imports, State, Handler, UI Integration |
| `src/components/DuplicateShiftModal.tsx` | Keine Änderungen (bereits vorhanden) |
| `src/components/KeyboardShortcutsHelp.tsx` | Keine Änderungen (bereits vorhanden) |
| `src/hooks/use-keyboard-shortcuts.ts` | Keine Änderungen (bereits vorhanden) |

---

**Implementiert von:** Claude Sonnet 4.5 + David Alberg
**Datum:** 2026-02-01
**Version:** 1.0
