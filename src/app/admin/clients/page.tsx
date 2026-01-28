"use client"

import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { UserCircle, Edit2, Trash2, Plus, X, Save, Search, ArrowUpDown } from "lucide-react"

interface Client {
    id: string
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
    state: string | null
    isActive: boolean
    teams: Array<{ id: string; name: string }>
}

const BUNDESLAENDER = [
    "Baden-Württemberg",
    "Bayern",
    "Berlin",
    "Brandenburg",
    "Bremen",
    "Hamburg",
    "Hessen",
    "Mecklenburg-Vorpommern",
    "Niedersachsen",
    "Nordrhein-Westfalen",
    "Rheinland-Pfalz",
    "Saarland",
    "Sachsen",
    "Sachsen-Anhalt",
    "Schleswig-Holstein",
    "Thüringen"
]

// Generate a consistent color from a string
function getAvatarColor(name: string): string {
    const colors = [
        "bg-purple-500",
        "bg-blue-500",
        "bg-green-500",
        "bg-yellow-500",
        "bg-red-500",
        "bg-pink-500",
        "bg-indigo-500",
        "bg-teal-500",
        "bg-orange-500",
        "bg-cyan-500"
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
}

export default function ClientsPage() {
    const { data: session } = useSession()
    const [clients, setClients] = useState<Client[]>([])
    const [loading, setLoading] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const [editingClient, setEditingClient] = useState<Client | null>(null)
    const [activeTab, setActiveTab] = useState<"active" | "inactive">("active")
    const [searchQuery, setSearchQuery] = useState("")
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")
    const [formData, setFormData] = useState({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        state: ""
    })

    useEffect(() => {
        fetchClients()
    }, [])

    const fetchClients = async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/clients")
            if (res.ok) {
                const data = await res.json()
                setClients(data.clients || [])
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleCreate = () => {
        setEditingClient(null)
        setFormData({
            firstName: "",
            lastName: "",
            email: "",
            phone: "",
            state: ""
        })
        setShowModal(true)
    }

    const handleEdit = (client: Client) => {
        setEditingClient(client)
        setFormData({
            firstName: client.firstName,
            lastName: client.lastName,
            email: client.email || "",
            phone: client.phone || "",
            state: client.state || ""
        })
        setShowModal(true)
    }

    const handleSave = async () => {
        if (!formData.firstName || !formData.lastName) {
            alert("Vorname und Nachname sind erforderlich")
            return
        }

        setLoading(true)
        try {
            if (editingClient) {
                // Update
                const res = await fetch(`/api/clients/${editingClient.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(formData)
                })

                if (res.ok) {
                    setShowModal(false)
                    fetchClients()
                } else {
                    const err = await res.json()
                    alert(`Fehler: ${err.error}`)
                }
            } else {
                // Create
                const res = await fetch("/api/clients", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(formData)
                })

                if (res.ok) {
                    setShowModal(false)
                    fetchClients()
                } else {
                    const err = await res.json()
                    alert(`Fehler: ${err.error}`)
                }
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (client: Client) => {
        if (!confirm(`Klient "${client.firstName} ${client.lastName}" wirklich deaktivieren?`)) {
            return
        }

        setLoading(true)
        try {
            const res = await fetch(`/api/clients/${client.id}`, {
                method: "DELETE"
            })

            if (res.ok) {
                fetchClients()
            } else {
                const err = await res.json()
                alert(`Fehler: ${err.error}`)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleReactivate = async (client: Client) => {
        setLoading(true)
        try {
            const res = await fetch(`/api/clients/${client.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: true })
            })

            if (res.ok) {
                fetchClients()
            } else {
                const err = await res.json()
                alert(`Fehler: ${err.error}`)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    // Filter and sort clients
    const filteredClients = clients
        .filter(c => c.isActive === (activeTab === "active"))
        .filter(c => {
            if (!searchQuery) return true
            const fullName = `${c.firstName} ${c.lastName}`.toLowerCase()
            const email = c.email?.toLowerCase() || ""
            const query = searchQuery.toLowerCase()
            return fullName.includes(query) || email.includes(query)
        })
        .sort((a, b) => {
            const nameA = `${a.lastName} ${a.firstName}`.toLowerCase()
            const nameB = `${b.lastName} ${b.firstName}`.toLowerCase()
            return sortOrder === "asc" ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA)
        })

    const activeCount = clients.filter(c => c.isActive).length
    const inactiveCount = clients.filter(c => !c.isActive).length

    if (loading && clients.length === 0) {
        return (
            <div className="admin-dark min-h-screen bg-neutral-950 flex items-center justify-center">
                <div className="text-xl text-neutral-400">Lädt...</div>
            </div>
        )
    }

    return (
        <div className="admin-dark min-h-screen bg-neutral-950 p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <UserCircle className="text-purple-400" size={28} />
                        Klienten
                    </h1>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-4">
                    <button
                        onClick={() => setActiveTab("active")}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                            activeTab === "active"
                                ? "bg-neutral-800 text-white"
                                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
                        }`}
                    >
                        Aktiv ({activeCount})
                    </button>
                    <button
                        onClick={() => setActiveTab("inactive")}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                            activeTab === "inactive"
                                ? "bg-neutral-800 text-white"
                                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
                        }`}
                    >
                        Inaktiv ({inactiveCount})
                    </button>
                </div>

                {/* Search and Sort */}
                <div className="flex gap-3 mb-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                        <input
                            type="text"
                            placeholder="Suchen..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                    </div>
                    <button
                        onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                        className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-300 hover:bg-neutral-700 transition flex items-center gap-2"
                    >
                        <ArrowUpDown size={16} />
                        {sortOrder === "asc" ? "A-Z" : "Z-A"}
                    </button>
                </div>

                {/* Client List */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                    {filteredClients.length === 0 ? (
                        <div className="text-center py-12 text-neutral-500">
                            {searchQuery ? "Keine Klienten gefunden" : `Keine ${activeTab === "active" ? "aktiven" : "inaktiven"} Klienten`}
                        </div>
                    ) : (
                        <div className="divide-y divide-neutral-800">
                            {filteredClients.map((client) => (
                                <div
                                    key={client.id}
                                    className="flex items-center gap-4 p-4 hover:bg-neutral-800/50 transition group"
                                >
                                    {/* Avatar */}
                                    <div className={`w-10 h-10 rounded-full ${getAvatarColor(client.firstName + client.lastName)} flex items-center justify-center shrink-0`}>
                                        <span className="text-white font-medium">
                                            {client.firstName.charAt(0).toUpperCase()}
                                        </span>
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-medium truncate">
                                            {client.firstName} {client.lastName}
                                        </p>
                                        <p className="text-neutral-500 text-sm truncate">
                                            {client.email || "Keine E-Mail"}
                                        </p>
                                    </div>

                                    {/* State Badge */}
                                    {client.state && (
                                        <span className="hidden sm:inline-block px-2 py-1 bg-neutral-800 text-neutral-400 text-xs rounded">
                                            {client.state}
                                        </span>
                                    )}

                                    {/* Actions */}
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                        <button
                                            onClick={() => handleEdit(client)}
                                            className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded transition"
                                            title="Bearbeiten"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        {activeTab === "active" ? (
                                            <button
                                                onClick={() => handleDelete(client)}
                                                className="p-2 text-neutral-400 hover:text-red-400 hover:bg-neutral-700 rounded transition"
                                                title="Deaktivieren"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleReactivate(client)}
                                                className="p-2 text-neutral-400 hover:text-green-400 hover:bg-neutral-700 rounded transition"
                                                title="Reaktivieren"
                                            >
                                                <Plus size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Add Button */}
                <div className="flex justify-center mt-6">
                    <button
                        onClick={handleCreate}
                        className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition flex items-center gap-2"
                    >
                        <Plus size={20} />
                        Hinzufügen
                    </button>
                </div>

                {/* Modal */}
                {showModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center">
                        <div className="absolute inset-0 bg-black/60" onClick={() => setShowModal(false)} />
                        <div className="relative bg-neutral-900 border border-neutral-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-white">
                                    {editingClient ? "Klient bearbeiten" : "Klient erstellen"}
                                </h2>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                                        Vorname *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.firstName}
                                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                                        Nachname *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.lastName}
                                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                                        E-Mail
                                    </label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                                        Telefon
                                    </label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                                        Bundesland
                                    </label>
                                    <select
                                        value={formData.state}
                                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    >
                                        <option value="">Bitte wählen...</option>
                                        {BUNDESLAENDER.map((state) => (
                                            <option key={state} value={state}>
                                                {state}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <button
                                        onClick={() => setShowModal(false)}
                                        className="flex-1 px-4 py-2 border border-neutral-700 text-neutral-300 rounded-lg hover:bg-neutral-800 transition"
                                    >
                                        Abbrechen
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={loading}
                                        className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition flex items-center justify-center gap-2"
                                    >
                                        <Save size={18} />
                                        {loading ? "Speichert..." : (editingClient ? "Speichern" : "Erstellen")}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
