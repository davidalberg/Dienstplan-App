"use client"

import { useSession, signOut } from "next-auth/react"
import { useEffect, useState } from "react"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import { User, Mail, Users, Calendar, LogOut } from "lucide-react"

interface ProfileData {
    id: string
    name: string | null
    email: string
    role: string
    createdAt: string
    team: {
        id: string
        name: string
        client: {
            id: string
            firstName: string
            lastName: string
        } | null
    } | null
}

export default function ProfilePage() {
    const { data: session } = useSession()
    const [profile, setProfile] = useState<ProfileData | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!session) return
        fetch("/api/profile")
            .then(res => res.json())
            .then(data => setProfile(data))
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [session])

    if (!session) return null

    return (
        <div className="pb-20">
            <header className="sticky top-0 z-10 border-b bg-white p-4 shadow-sm">
                <div className="mx-auto max-w-2xl">
                    <h1 className="text-xl font-bold text-black">Profil</h1>
                </div>
            </header>

            <main className="mx-auto max-w-2xl p-4">
                {loading ? (
                    <div className="py-10 text-center text-gray-500">Lade Profil...</div>
                ) : profile ? (
                    <div className="space-y-4">
                        {/* Avatar + Name */}
                        <div className="flex flex-col items-center rounded-xl bg-white p-6 shadow-sm">
                            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                                <User size={36} />
                            </div>
                            <h2 className="mt-3 text-xl font-bold text-gray-900">
                                {profile.name || "Kein Name"}
                            </h2>
                            <span className="mt-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600">
                                {profile.role === "EMPLOYEE" ? "Mitarbeiter" :
                                 profile.role === "TEAMLEAD" ? "Teamleitung" :
                                 profile.role === "ADMIN" ? "Administrator" : profile.role}
                            </span>
                        </div>

                        {/* Info Cards */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
                                <Mail size={18} className="text-gray-400" />
                                <div>
                                    <p className="text-xs text-gray-500">E-Mail</p>
                                    <p className="text-sm font-medium text-gray-900">{profile.email}</p>
                                </div>
                            </div>

                            {profile.team && (
                                <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
                                    <Users size={18} className="text-gray-400" />
                                    <div>
                                        <p className="text-xs text-gray-500">Team / Klient</p>
                                        <p className="text-sm font-medium text-gray-900">
                                            {profile.team.client
                                                ? `${profile.team.client.firstName} ${profile.team.client.lastName}`
                                                : profile.team.name
                                            }
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
                                <Calendar size={18} className="text-gray-400" />
                                <div>
                                    <p className="text-xs text-gray-500">Registriert seit</p>
                                    <p className="text-sm font-medium text-gray-900">
                                        {format(new Date(profile.createdAt), "dd. MMMM yyyy", { locale: de })}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Logout Button */}
                        <button
                            onClick={() => signOut({ callbackUrl: "/login" })}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 py-3 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
                        >
                            <LogOut size={16} />
                            Abmelden
                        </button>
                    </div>
                ) : (
                    <div className="py-10 text-center text-gray-500">Profil konnte nicht geladen werden</div>
                )}
            </main>
        </div>
    )
}
