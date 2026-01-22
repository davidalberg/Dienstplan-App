import React, { useState, useEffect } from 'react';
import {
  Clock, User, Plus, LogOut, ChevronRight,
  History, Save, Trash2, Download, ShieldCheck, ArrowLeft, Pencil
} from 'lucide-react';
import * as XLSX from 'xlsx';

/**
 * APP KONFIGURATION & TEAMS
 */
const STORAGE_KEY = 'assistenz_plus_data_v1';

const TEAMS = {
  'team-a': {
    name: 'Team A',
    code: '1234',
    members: ['Lara Müller'],
    description: '1 Person'
  },
  'team-b': {
    name: 'Team B',
    code: '5678',
    members: ['Zian Schero', 'Mitarbeiter 2', 'Mitarbeiter 3', 'Mitarbeiter 4'],
    description: '4 Personen'
  }
};

export default function App() {
  const [teamId, setTeamId] = useState(null);
  const [authCode, setAuthCode] = useState('');
  const [view, setView] = useState('login'); // login, dashboard, add
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null); // ID des Eintrags der bearbeitet wird

  // Formular-Status
  const [formData, setFormData] = useState({
    name: '',
    date: new Date().toISOString().split('T')[0],
    startTime: '08:00',
    endTime: '16:00',
    note: '',
    type: 'Arbeit'
  });

  // --- DATEN LADEN (LOCAL STORAGE) ---
  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      setEntries(JSON.parse(savedData));
    }
  }, []);

  // --- DATEN SPEICHERN (LOCAL STORAGE) ---
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  // Login Handler
  const handleLogin = (e) => {
    e.preventDefault();
    const foundTeam = Object.entries(TEAMS).find(([id, t]) => t.code === authCode);
    if (foundTeam) {
      setTeamId(foundTeam[0]);
      setView('dashboard');
      setError('');
    } else {
      setError('Falscher Team-Code. Versuche 1234 oder 5678.');
    }
  };

  // Berechnung der Stunden
  const calculateHours = (start, end) => {
    if (!start || !end) return "0.00";
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff < 0) diff += 24 * 60;
    return (diff / 60).toFixed(2);
  };

  // Eintrag speichern (neu oder bearbeiten)
  const handleSave = (e) => {
    e.preventDefault();
    if (!teamId || !formData.name) return;

    setLoading(true);

    setTimeout(() => {
      const hours = calculateHours(formData.startTime, formData.endTime);

      if (editingId) {
        // Bestehenden Eintrag aktualisieren
        setEntries(prev => prev.map(entry =>
          entry.id === editingId
            ? { ...entry, ...formData, hours: parseFloat(hours), updatedAt: new Date().toISOString() }
            : entry
        ).sort((a, b) => new Date(b.date) - new Date(a.date)));
        setEditingId(null);
      } else {
        // Neuen Eintrag erstellen
        const newEntry = {
          id: Date.now().toString(),
          teamId,
          ...formData,
          hours: parseFloat(hours),
          createdAt: new Date().toISOString(),
        };
        setEntries(prev => [newEntry, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date)));
      }

      setView('dashboard');
      setFormData({ name: '', date: new Date().toISOString().split('T')[0], startTime: '08:00', endTime: '16:00', note: '', type: 'Arbeit' });
      setLoading(false);
    }, 500);
  };

  // Eintrag bearbeiten
  const handleEdit = (entry) => {
    setFormData({
      name: entry.name,
      date: entry.date,
      startTime: entry.startTime,
      endTime: entry.endTime,
      note: entry.note || '',
      type: entry.type || 'Arbeit'
    });
    setEditingId(entry.id);
    setView('add');
  };

  // Eintrag löschen
  const handleDelete = (id) => {
    if (window.confirm("Eintrag unwiderruflich löschen?")) {
      setEntries(entries.filter(e => e.id !== id));
    }
  };

  /**
   * EXCEL EXPORT (XLSX) - Browser-kompatibel
   */
  const exportToExcel = () => {
    try {
      const teamEntries = entries.filter(e => e.teamId === teamId);

      const latestDate = teamEntries.length > 0 ? new Date(teamEntries[0].date) : new Date();
      const year = latestDate.getFullYear();
      const month = latestDate.getMonth();

      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const monthName = latestDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

      const dataRows = [];

      // Loop durch alle Tage des Monats
      for (let day = 1; day <= daysInMonth; day++) {
        const currentValDate = new Date(year, month, day);
        const dateStr = currentValDate.toISOString().split('T')[0];
        const dayName = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][currentValDate.getDay()];
        const dateFormatted = currentValDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });

        const daysEntries = teamEntries.filter(e => e.date === dateStr);

        if (daysEntries.length > 0) {
          daysEntries.forEach(entry => {
            dataRows.push({
              'Tag': dayName,
              'Datum': dateFormatted,
              'Name': entry.name,
              'Beginn': entry.startTime,
              'Ende': entry.endTime,
              'Stunden': entry.hours.toFixed(2).replace('.', ','),
              'BackUp': '',
              'Urlaub/Krank': '',
              'Sonstiges': entry.note || ''
            });
          });
        } else {
          dataRows.push({
            'Tag': dayName,
            'Datum': dateFormatted,
            'Name': '',
            'Beginn': '',
            'Ende': '',
            'Stunden': '0,00',
            'BackUp': '',
            'Urlaub/Krank': '',
            'Sonstiges': ''
          });
        }
      }

      // Workbook erstellen
      const wb = XLSX.utils.book_new();

      // Worksheet aus JSON erstellen
      const ws = XLSX.utils.json_to_sheet(dataRows, {
        header: ['Tag', 'Datum', 'Name', 'Beginn', 'Ende', 'Stunden', 'BackUp', 'Urlaub/Krank', 'Sonstiges']
      });

      // Spaltenbreiten
      ws['!cols'] = [
        { wch: 5 },   // Tag
        { wch: 12 },  // Datum
        { wch: 20 },  // Name
        { wch: 10 },  // Beginn
        { wch: 10 },  // Ende
        { wch: 10 },  // Stunden
        { wch: 10 },  // BackUp
        { wch: 15 },  // Urlaub/Krank
        { wch: 30 }   // Sonstiges
      ];

      // Titel-Zeile am Anfang einfügen
      XLSX.utils.sheet_add_aoa(ws, [[`Dienstplan ${monthName}`]], { origin: 'A1' });

      // Alle Daten um eine Zeile nach unten verschieben
      // Das machen wir, indem wir die Daten neu schreiben
      const titleRow = [[`Dienstplan ${monthName}`, '', '', '', '', '', '', '', '']];
      const headerRow = [['Tag', 'Datum', 'Name', 'Beginn', 'Ende', 'Stunden', 'BackUp', 'Urlaub/Krank', 'Sonstiges']];
      const dataArray = dataRows.map(row => [
        row['Tag'], row['Datum'], row['Name'], row['Beginn'],
        row['Ende'], row['Stunden'], row['BackUp'], row['Urlaub/Krank'], row['Sonstiges']
      ]);

      const allData = [...titleRow, ...headerRow, ...dataArray];
      const ws2 = XLSX.utils.aoa_to_sheet(allData);

      // Spaltenbreiten nochmal setzen
      ws2['!cols'] = [
        { wch: 5 },   // Tag
        { wch: 12 },  // Datum
        { wch: 20 },  // Name
        { wch: 10 },  // Beginn
        { wch: 10 },  // Ende
        { wch: 10 },  // Stunden
        { wch: 10 },  // BackUp
        { wch: 15 },  // Urlaub/Krank
        { wch: 30 }   // Sonstiges
      ];

      // Merge für Titel (A1:I1)
      ws2['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];

      XLSX.utils.book_append_sheet(wb, ws2, "Stundennachweis");

      // Download triggern (Browser-kompatibel)
      XLSX.writeFile(wb, `Dienstplan_${TEAMS[teamId]?.name || 'Export'}_${monthName}.xlsx`);

      console.log('Export erfolgreich!');

    } catch (err) {
      console.error("Export Error:", err);
      alert("Fehler beim Exportieren: " + err.message);
    }
  };

  // --- UI ---

  if (view === 'login') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl p-8 border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>

          <div className="flex flex-col items-center mb-10 mt-4">
            <div className="bg-indigo-600 p-4 rounded-2xl shadow-xl shadow-indigo-100 mb-4">
              <ShieldCheck className="text-white w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">AssistenzPlus <span className="text-indigo-600">App</span></h1>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">Stundennachweis v1.0</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Team-Zugangscode</label>
              <input
                type="password"
                inputMode="numeric"
                className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 text-center text-3xl tracking-[0.5em] font-black transition-all placeholder:text-slate-200"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                placeholder="****"
                autoFocus
              />
            </div>
            {error && <p className="text-red-500 text-xs font-bold text-center animate-pulse">{error}</p>}

            <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-2xl font-black shadow-lg shadow-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-3">
              Einloggen <ChevronRight size={20} />
            </button>
          </form>

          <div className="mt-12 text-center">
            <p className="text-[9px] text-slate-300 uppercase font-black tracking-widest leading-relaxed">
              Lokaler Modus Aktiv<br />Daten werden im Browser gespeichert
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Filter entries for current team
  const visibleEntries = entries.filter(e => e.teamId === teamId);

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-28">
      {/* Mobile Top Bar */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 py-5 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-100">
            <Clock size={18} className="text-white" />
          </div>
          <div>
            <span className="font-black text-slate-800 text-sm block leading-none">{TEAMS[teamId].name}</span>
            <span className="text-[9px] text-slate-400 font-bold uppercase">{TEAMS[teamId].description}</span>
          </div>
        </div>
        <button onClick={() => setView('login')} className="bg-slate-50 p-2 rounded-xl text-slate-400 hover:text-red-500 transition-colors">
          <LogOut size={20} />
        </button>
      </nav>

      {/* Content Area */}
      <div className="max-w-md mx-auto p-5">

        {view === 'dashboard' ? (
          <div className="space-y-6">
            <div className="flex justify-between items-end px-1">
              <h2 className="text-xl font-black text-slate-800">Verlauf</h2>
              <button
                onClick={exportToExcel}
                className="text-[10px] font-black text-emerald-600 flex items-center gap-1.5 bg-emerald-50 px-4 py-2 rounded-full active:scale-95 transition-all border border-emerald-100 shadow-sm hover:bg-emerald-100"
              >
                <Download size={14} /> EXCEL EXPORT
              </button>
            </div>

            <div className="space-y-4">
              {visibleEntries.length === 0 ? (
                <div className="bg-white border-4 border-dashed border-slate-100 rounded-[2.5rem] p-16 text-center">
                  <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-200">
                    <History size={32} />
                  </div>
                  <p className="text-slate-400 text-sm font-bold">Noch keine Stunden<br />erfasst.</p>
                </div>
              ) : (
                visibleEntries.map(entry => (
                  <div key={entry.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex justify-between items-center group animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex gap-4 items-center">
                      <div className="bg-indigo-50 text-indigo-600 w-12 h-12 rounded-2xl flex flex-col items-center justify-center">
                        <span className="text-sm font-black leading-none">{entry.hours}</span>
                        <span className="text-[8px] font-black uppercase">Std</span>
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">{entry.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 tracking-tight">
                          {new Date(entry.date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })} • {entry.startTime} - {entry.endTime}
                        </p>
                        {entry.note && <p className="text-[10px] text-slate-400 mt-1 italic">"{entry.note}"</p>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEdit(entry)}
                        className="p-2 text-slate-200 hover:text-indigo-500 transition-colors"
                        title="Bearbeiten"
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="p-2 text-slate-200 hover:text-red-500 transition-colors"
                        title="Löschen"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* ADD ENTRY VIEW */
          <div className="animate-in slide-in-from-right-10 duration-300">
            <div className="flex items-center gap-4 mb-6">
              <button onClick={() => setView('dashboard')} className="p-2 bg-white rounded-xl shadow-sm text-slate-400">
                <ArrowLeft size={20} />
              </button>
              <h2 className="text-2xl font-black text-slate-800">{editingId ? 'Eintrag bearbeiten' : 'Stunden erfassen'}</h2>
            </div>

            <form onSubmit={handleSave} className="bg-white rounded-[2.5rem] p-7 shadow-xl shadow-slate-200/50 border border-slate-100 space-y-6">
              <div className="space-y-5">
                {/* Mitarbeiter */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Mitarbeiter wählen</label>
                  <select
                    required
                    className="w-full p-5 bg-slate-50 rounded-2xl outline-none border-2 border-transparent focus:border-indigo-500 font-bold text-slate-700 appearance-none"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  >
                    <option value="">Bitte wählen...</option>
                    {TEAMS[teamId].members.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                {/* Datum */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Datum</label>
                  <input
                    type="date" required
                    className="w-full p-5 bg-slate-50 rounded-2xl outline-none border-2 border-transparent focus:border-indigo-500 font-bold text-slate-700"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  />
                </div>

                {/* Zeiten */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-emerald-600 ml-1 tracking-widest">Beginn</label>
                    <input
                      type="time" required
                      className="w-full p-5 bg-emerald-50/50 text-emerald-700 rounded-2xl outline-none border-2 border-transparent focus:border-emerald-500 font-black text-xl"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-red-500 ml-1 tracking-widest">Ende</label>
                    <input
                      type="time" required
                      className="w-full p-5 bg-red-50/50 text-red-700 rounded-2xl outline-none border-2 border-transparent focus:border-red-500 font-black text-xl"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    />
                  </div>
                </div>

                {/* Notiz */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Sonstiges (Optional)</label>
                  <input
                    type="text"
                    placeholder="Z.B. Besprechung, Begleitung..."
                    className="w-full p-5 bg-slate-50 rounded-2xl outline-none border-2 border-transparent focus:border-indigo-500 font-medium placeholder:text-slate-300"
                    value={formData.note}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  />
                </div>

                {/* Automatische Berechnung */}
                <div className="bg-indigo-600 p-6 rounded-3xl flex justify-between items-center shadow-lg shadow-indigo-100 mt-4 relative overflow-hidden">
                  <div className="relative z-10">
                    <span className="text-indigo-100 text-[10px] font-black uppercase tracking-widest block mb-1">Berechnete Stunden</span>
                    <span className="text-3xl font-black text-white">{calculateHours(formData.startTime, formData.endTime)}<span className="text-sm ml-1 text-indigo-200">Std</span></span>
                  </div>
                  <Clock size={48} className="text-indigo-500/30 absolute -right-2 -bottom-2" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:bg-slate-400"
              >
                {loading ? 'Speichere...' : <><Save size={20} /> {editingId ? 'Änderungen speichern' : 'Eintrag speichern'}</>}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-slate-100 p-5 flex justify-around items-center safe-area-bottom shadow-[0_-10px_30px_rgba(0,0,0,0.03)] z-[100]">
        <button
          onClick={() => setView('dashboard')}
          className={`flex flex-col items-center gap-1.5 transition-all ${view === 'dashboard' ? 'text-indigo-600' : 'text-slate-300'}`}
        >
          <History size={26} strokeWidth={view === 'dashboard' ? 3 : 2} />
          <span className="text-[9px] font-black uppercase tracking-widest">Verlauf</span>
        </button>

        <button
          onClick={() => setView('add')}
          className={`bg-indigo-600 text-white w-16 h-16 rounded-[1.75rem] flex items-center justify-center shadow-2xl shadow-indigo-200 -mt-12 border-4 border-white active:scale-90 transition-all ${view === 'add' ? 'scale-110' : ''}`}
        >
          <Plus size={36} strokeWidth={3} />
        </button>

        <button
          onClick={() => alert("Profil-Einstellungen folgen in Kürze.")}
          className="flex flex-col items-center gap-1.5 text-slate-300"
        >
          <User size={26} />
          <span className="text-[9px] font-black uppercase tracking-widest">Profil</span>
        </button>
      </div>
    </div>
  );
}
