"use client"

import { useState, useEffect } from "react"
import { useActivityLog } from "@/hooks/use-admin-data"
import {
    Activity,
    AlertCircle,
    CheckCircle,
    Info,
    AlertTriangle,
    Calendar,
    Users,
    Building2,
    Settings,
    Trash2,
    RefreshCw,
    Database
} from "lucide-react"
import { toast } from "sonner"

type ActivityType = "INFO" | "WARNING" | "ERROR" | "SUCCESS"
type ActivityCategory = "SHIFT" | "SUBMISSION" | "CLIENT" | "EMPLOYEE" | "SYSTEM"

interface ActivityItem {
    id: string
    type: ActivityType
    category: ActivityCategory
    action: string
    details: string | null
    userId: string | null
    userName: string | null
    entityId: string | null
    entityType: string | null
    createdAt: string
}

interface OrphanedTeam {
    id: string
    name: string
    clientId: string | null
    client?: {
        firstName: string
        lastName: string
    } | null
    _count: {
        members: number
        timesheets: number
    }
}

const typeIcons: Record<ActivityType, React.ReactNode> = {
    INFO: <Info className="w-4 h-4 text-blue-400" />,
    WARNING: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
    ERROR: <AlertCircle className="w-4 h-4 text-red-400" />,
    SUCCESS: <CheckCircle className="w-4 h-4 text-green-400" />,
}

const typeColors: Record<ActivityType, string> = {
    INFO: "bg-blue-500/10 border-blue-500/30",
    WARNING: "bg-yellow-500/10 border-yellow-500/30",
    ERROR: "bg-red-500/10 border-red-500/30",
    SUCCESS: "bg-green-500/10 border-green-500/30",
}

const categoryIcons: Record<ActivityCategory, React.ReactNode> = {
    SHIFT: <Calendar className="w-3 h-3" />,
    SUBMISSION: <Activity className="w-3 h-3" />,
    CLIENT: <Building2 className="w-3 h-3" />,
    EMPLOYEE: <Users className="w-3 h-3" />,
    SYSTEM: <Settings className="w-3 h-3" />,
}

const categoryLabels: Record<ActivityCategory, string> = {
    SHIFT: "Schicht",
    SUBMISSION: "Einreichung",
    CLIENT: "Klient",
    EMPLOYEE: "Mitarbeiter",
    SYSTEM: "System",
}

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState<"activity" | "database" | "system">("activity")
    const [filterType, setFilterType] = useState<string>("")
    const [filterCategory, setFilterCategory] = useState<string>("")
    const [orphanedTeams, setOrphanedTeams] = useState<OrphanedTeam[]>([])
    const [dbLoading, setDbLoading] = useState(false)
    const [stats, setStats] = useState({
        totalTeams: 0,
        orphanedTeams: 0,
        teamsWithMembers: 0
    })

    const { activities, total, isLoading, mutate } = useActivityLog(
        100,
        filterType || undefined,
        filterCategory || undefined
    )

    useEffect(() => {
        if (activeTab === "database") {
            loadOrphanedTeams()
        }
    }, [activeTab])

    const loadOrphanedTeams = async () => {
        setDbLoading(true)
        try {
            const res = await fetch("/api/admin/teams/orphaned")
            if (res.ok) {
                const data = await res.json()
                setOrphanedTeams(data.orphanedTeams || [])
                setStats(data.stats)
            } else {
                toast.error("Fehler beim Laden der Teams")
            }
        } catch (err) {
            console.error(err)
            toast.error("Fehler beim Laden")
        } finally {
            setDbLoading(false)
        }
    }

    const handleCleanupOrphaned = async () => {
        if (!confirm(
            `${orphanedTeams.length} verwaiste Teams wirklich löschen?\n\n` +
            "Diese Teams haben keine Mitglieder mehr. " +
            "Warnung: Schichten ohne Team werden zu 'Ohne Klient'."
        )) {
            return
        }

        setDbLoading(true)
        try {
            const res = await fetch("/api/admin/teams/orphaned", {
                method: "DELETE"
            })

            if (res.ok) {
                const data = await res.json()
                toast.success(`${data.deletedCount} Teams gelöscht`)
                loadOrphanedTeams()
            } else {
                const err = await res.json()
                toast.error(err.error)
            }
        } catch {
            toast.error("Fehler beim Löschen")
        } finally {
            setDbLoading(false)
        }
    }

    const handleCleanup = async () => {
        if (!confirm("Aktivitäten älter als 30 Tage löschen?")) return

        try {
            const res = await fetch("/api/admin/activity?olderThanDays=30", {
                method: "DELETE"
            })
            const data = await res.json()
            toast.success(`${data.deleted} Einträge gelöscht`)
            mutate()
        } catch {
            toast.error("Fehler beim Löschen")
        }
    }

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        const now = new Date()
        const diff = now.getTime() - date.getTime()
        const minutes = Math.floor(diff / 60000)
        const hours = Math.floor(diff / 3600000)
        const days = Math.floor(diff / 86400000)

        if (minutes < 1) return "Gerade eben"
        if (minutes < 60) return `vor ${minutes} Min.`
        if (hours < 24) return `vor ${hours} Std.`
        if (days < 7) return `vor ${days} Tagen`

        return date.toLocaleDateString("de-DE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        })
    }

    const parseDetails = (details: string | null): Record<string, any> | null => {
        if (!details) return null
        try {
            return JSON.parse(details)
        } catch {
            return null
        }
    }

    return (
        <div className="min-h-screen bg-neutral-950 text-white p-6">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold">Einstellungen</h1>
                        <p className="text-neutral-400 text-sm mt-1">
                            Systemkonfiguration und Aktivitätsprotokoll
                        </p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-6 border-b border-neutral-800 pb-4">
                    <button
                        onClick={() => setActiveTab("activity")}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            activeTab === "activity"
                                ? "bg-violet-600 text-white"
                                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                        }`}
                    >
                        <Activity className="w-4 h-4 inline-block mr-2" />
                        Protokoll
                    </button>
                    <button
                        onClick={() => setActiveTab("database")}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            activeTab === "database"
                                ? "bg-violet-600 text-white"
                                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                        }`}
                    >
                        <Database className="w-4 h-4 inline-block mr-2" />
                        Datenbank
                    </button>
                    <button
                        onClick={() => setActiveTab("system")}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            activeTab === "system"
                                ? "bg-violet-600 text-white"
                                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                        }`}
                    >
                        <Settings className="w-4 h-4 inline-block mr-2" />
                        System
                    </button>
                </div>

                {/* Activity Log Tab */}
                {activeTab === "activity" && (
                    <div className="bg-neutral-900 rounded-xl border border-neutral-800">
                        {/* Filter Bar */}
                        <div className="p-4 border-b border-neutral-800 flex items-center gap-4 flex-wrap">
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-neutral-400">Typ:</label>
                                <select
                                    value={filterType}
                                    onChange={(e) => setFilterType(e.target.value)}
                                    className="bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm"
                                >
                                    <option value="">Alle</option>
                                    <option value="INFO">Info</option>
                                    <option value="SUCCESS">Erfolg</option>
                                    <option value="WARNING">Warnung</option>
                                    <option value="ERROR">Fehler</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-neutral-400">Kategorie:</label>
                                <select
                                    value={filterCategory}
                                    onChange={(e) => setFilterCategory(e.target.value)}
                                    className="bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm"
                                >
                                    <option value="">Alle</option>
                                    <option value="SHIFT">Schichten</option>
                                    <option value="SUBMISSION">Einreichungen</option>
                                    <option value="CLIENT">Klienten</option>
                                    <option value="EMPLOYEE">Mitarbeiter</option>
                                    <option value="SYSTEM">System</option>
                                </select>
                            </div>
                            <div className="flex-1" />
                            <button
                                onClick={() => mutate()}
                                className="p-2 bg-neutral-800 rounded hover:bg-neutral-700 transition-colors"
                                title="Aktualisieren"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleCleanup}
                                className="px-3 py-1.5 bg-red-600/20 text-red-400 rounded text-sm hover:bg-red-600/30 transition-colors flex items-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                Alte löschen
                            </button>
                        </div>

                        {/* Activity List */}
                        <div className="divide-y divide-neutral-800">
                            {isLoading ? (
                                <div className="p-8 text-center text-neutral-500">
                                    Laden...
                                </div>
                            ) : activities.length === 0 ? (
                                <div className="p-8 text-center text-neutral-500">
                                    <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p>Keine Aktivitäten gefunden</p>
                                    <p className="text-sm mt-1">
                                        Aktivitäten werden automatisch protokolliert
                                    </p>
                                </div>
                            ) : (
                                activities.map((activity: ActivityItem) => {
                                    const details = parseDetails(activity.details)
                                    return (
                                        <div
                                            key={activity.id}
                                            className={`p-4 hover:bg-neutral-800/50 transition-colors border-l-4 ${
                                                typeColors[activity.type]
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="mt-0.5">
                                                    {typeIcons[activity.type]}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-medium">
                                                            {activity.action}
                                                        </span>
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-800 rounded text-xs text-neutral-400">
                                                            {categoryIcons[activity.category]}
                                                            {categoryLabels[activity.category]}
                                                        </span>
                                                    </div>
                                                    {details && (
                                                        <div className="mt-2 text-sm text-neutral-400 bg-neutral-800/50 rounded p-2 font-mono">
                                                            {details.error ? (
                                                                <span className="text-red-400">
                                                                    {details.error}
                                                                </span>
                                                            ) : (
                                                                <pre className="whitespace-pre-wrap">
                                                                    {JSON.stringify(details, null, 2)}
                                                                </pre>
                                                            )}
                                                        </div>
                                                    )}
                                                    <div className="mt-2 flex items-center gap-4 text-xs text-neutral-500">
                                                        <span>{formatDate(activity.createdAt)}</span>
                                                        {activity.userName && (
                                                            <span>von {activity.userName}</span>
                                                        )}
                                                        {activity.entityType && activity.entityId && (
                                                            <span>
                                                                {activity.entityType}: {activity.entityId.slice(0, 8)}...
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>

                        {/* Footer */}
                        {total > 0 && (
                            <div className="p-4 border-t border-neutral-800 text-sm text-neutral-500">
                                {total} Aktivitäten insgesamt
                            </div>
                        )}
                    </div>
                )}

                {/* Database Tab */}
                {activeTab === "database" && (
                    <div>
                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                                <div className="flex items-center gap-3">
                                    <Database className="text-blue-400" size={24} />
                                    <div>
                                        <p className="text-neutral-400 text-sm">Teams gesamt</p>
                                        <p className="text-white text-2xl font-bold">{stats.totalTeams}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                                <div className="flex items-center gap-3">
                                    <Users className="text-green-400" size={24} />
                                    <div>
                                        <p className="text-neutral-400 text-sm">Teams mit Mitgliedern</p>
                                        <p className="text-white text-2xl font-bold">{stats.teamsWithMembers}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                                <div className="flex items-center gap-3">
                                    <AlertTriangle className="text-yellow-400" size={24} />
                                    <div>
                                        <p className="text-neutral-400 text-sm">Verwaiste Teams</p>
                                        <p className="text-white text-2xl font-bold">{stats.orphanedTeams}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Fix Team Names Section */}
                        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-violet-500/20 rounded-lg">
                                    <Settings className="text-violet-400" size={24} />
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-lg font-semibold text-white mb-2">
                                        Team-Namen korrigieren
                                    </h2>
                                    <p className="text-neutral-400 text-sm mb-4">
                                        Entfernt "Team " Präfix aus Team-Namen und löscht fehlerhafte DienstplanConfigs.
                                        <br />
                                        <span className="text-yellow-400">⚠️ Führe dies aus wenn "Klient-Zuordnung fehlt" Fehler auftreten!</span>
                                    </p>
                                    <button
                                        onClick={async () => {
                                            if (!confirm('Team-Namen jetzt korrigieren?')) return;

                                            const btn = document.activeElement as HTMLButtonElement;
                                            btn.disabled = true;
                                            btn.textContent = 'Korrigiere...';

                                            try {
                                                const res = await fetch('/api/admin/fix-team-names', {
                                                    method: 'POST',
                                                    credentials: 'include'
                                                });
                                                const result = await res.json();

                                                if (res.ok) {
                                                    toast.success(`✅ ${result.results.fixed} Team-Namen korrigiert!`);
                                                    setTimeout(() => window.location.reload(), 1500);
                                                } else {
                                                    toast.error(result.error || 'Fehler beim Korrigieren');
                                                }
                                            } catch (err) {
                                                toast.error('Netzwerkfehler');
                                            } finally {
                                                btn.disabled = false;
                                                btn.textContent = 'Jetzt korrigieren';
                                            }
                                        }}
                                        className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors"
                                    >
                                        🔧 Jetzt korrigieren
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Orphaned Teams Section */}
                        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                        <AlertTriangle className="text-yellow-400" size={20} />
                                        Verwaiste Teams
                                    </h2>
                                    <p className="text-neutral-400 text-sm mt-1">
                                        Teams ohne Mitglieder können gelöscht werden
                                    </p>
                                </div>

                                {orphanedTeams.length > 0 && (
                                    <button
                                        onClick={handleCleanupOrphaned}
                                        disabled={dbLoading}
                                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <Trash2 size={16} />
                                        Alle löschen ({orphanedTeams.length})
                                    </button>
                                )}
                            </div>

                            <div className="divide-y divide-neutral-800">
                                {dbLoading ? (
                                    <div className="p-12 text-center text-neutral-500">
                                        Lade...
                                    </div>
                                ) : orphanedTeams.length === 0 ? (
                                    <div className="p-12 text-center text-neutral-500">
                                        Keine verwaisten Teams gefunden
                                    </div>
                                ) : (
                                    orphanedTeams.map((team) => (
                                        <div
                                            key={team.id}
                                            className="p-4 hover:bg-neutral-800/50 transition"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-white font-medium">{team.name}</p>
                                                    <div className="flex gap-4 mt-1">
                                                        <span className="text-neutral-400 text-sm">
                                                            Mitglieder: {team._count.members}
                                                        </span>
                                                        <span className="text-neutral-400 text-sm">
                                                            Schichten: {team._count.timesheets}
                                                        </span>
                                                        {team.client && (
                                                            <span className="text-violet-400 text-sm">
                                                                Klient: {team.client.firstName} {team.client.lastName}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* System Tab */}
                {activeTab === "system" && (
                    <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6">
                        <h2 className="text-lg font-semibold mb-4">System-Informationen</h2>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between py-3 border-b border-neutral-800">
                                <span className="text-neutral-400">Version</span>
                                <span className="font-mono">0.1.0</span>
                            </div>
                            <div className="flex items-center justify-between py-3 border-b border-neutral-800">
                                <span className="text-neutral-400">Framework</span>
                                <span className="font-mono">Next.js 15.5</span>
                            </div>
                            <div className="flex items-center justify-between py-3 border-b border-neutral-800">
                                <span className="text-neutral-400">Datenbank</span>
                                <span className="font-mono">Supabase PostgreSQL</span>
                            </div>
                            <div className="flex items-center justify-between py-3 border-b border-neutral-800">
                                <span className="text-neutral-400">Aktivitäten im Protokoll</span>
                                <span className="font-mono">{total}</span>
                            </div>
                        </div>

                        <div className="mt-8">
                            <h3 className="text-md font-semibold mb-3">Dokumentation</h3>
                            <div className="text-sm text-neutral-400 space-y-2">
                                <p>
                                    Siehe <code className="bg-neutral-800 px-1 rounded">claude.md</code> für Projekt-Dokumentation.
                                </p>
                                <p>
                                    Siehe <code className="bg-neutral-800 px-1 rounded">CHANGELOG.md</code> für Versionshistorie.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
