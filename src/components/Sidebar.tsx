"use client"

import { useSession, signOut } from "next-auth/react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { useState, useCallback } from "react"
import { useSWRConfig } from "swr"
import {
    Calendar,
    FileText,
    UserCircle,
    Settings,
    ChevronLeft,
    ChevronRight,
    LogOut,
    Search,
    UserCog,
    Wallet,
    Palmtree,
    LayoutDashboard,
    ClipboardList,
    Sparkles
} from "lucide-react"

interface NavItem {
    icon: React.ElementType
    label: string
    href?: string
    onClick?: () => void
    shortcut?: string
}

interface SidebarProps {
    onExportClick?: () => void
    mobileSidebarOpen?: boolean
    onMobileSidebarClose?: () => void
}

// Mapping: Sidebar-Href → API-URL die vorgeladen werden soll
const sidebarPrefetchMap: Record<string, string> = {
    "/admin/schedule": "/api/admin/schedule",
    "/admin/timesheets": "/api/admin/timesheets",
    "/admin/employee-timesheets": "/api/admin/submissions",
    "/admin/assistants": "/api/admin/employees",
    "/admin/clients": "/api/clients",
    "/admin/vacations": "/api/admin/vacations/absences",
    "/admin/payroll": "/api/admin/payroll",
}

export function Sidebar({ onExportClick, mobileSidebarOpen, onMobileSidebarClose }: SidebarProps) {
    const { data: session } = useSession()
    const pathname = usePathname()
    const [collapsed, setCollapsed] = useState(false)
    const { mutate } = useSWRConfig()

    // Hover-Prefetch: Liest Monat/Jahr aus localStorage (wird von allen Admin-Seiten geschrieben)
    // SWR dedupliciert automatisch über dedupingInterval (5 Min), daher kein manuelles Tracking nötig
    const prefetchPageData = useCallback((href: string) => {
        const apiUrl = sidebarPrefetchMap[href]
        if (!apiUrl) return

        // Monat/Jahr aus localStorage lesen (aktuellster Wert vom User)
        let month = new Date().getMonth() + 1
        let year = new Date().getFullYear()
        try {
            const saved = localStorage.getItem('admin-selected-month')
            if (saved) {
                const parsed = JSON.parse(saved)
                if (parsed.month >= 1 && parsed.month <= 12) {
                    month = parsed.month
                    year = parsed.year
                }
            }
        } catch { /* ignore */ }

        const separator = apiUrl.includes("?") ? "&" : "?"
        const fullUrl = `${apiUrl}${separator}month=${month}&year=${year}`

        mutate(fullUrl, fetch(fullUrl).then(res => res.ok ? res.json() : undefined), { revalidate: false })
    }, [mutate])

    const navItems: NavItem[] = [
        { icon: LayoutDashboard, label: "Dashboard", href: "/admin/dashboard" },
        { icon: Calendar, label: "Kalender", href: "/admin/schedule" },
        { icon: UserCog, label: "Assistenten", href: "/admin/assistants" },
        { icon: UserCircle, label: "Klienten", href: "/admin/clients" },
        { icon: ClipboardList, label: "Stundennachweise", href: "/admin/employee-timesheets" },
        { icon: FileText, label: "Gesamtstundennachweise", href: "/admin/timesheets" },
        { icon: Palmtree, label: "Urlaub / Krank", href: "/admin/vacations" },
        { icon: Wallet, label: "Lohnliste", href: "/admin/payroll" },
        { icon: Sparkles, label: "KI-Assistent", href: "/admin/ai-assistant" },
        { icon: Settings, label: "Einstellungen", href: "/admin/settings" },
    ]

    const isActive = (href?: string) => {
        if (!href) return false
        if (href === "/admin") return pathname === "/admin"
        return pathname.startsWith(href)
    }


    const NavLink = ({ item }: { item: NavItem }) => {
        const active = isActive(item.href)
        const baseClasses = `
            flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium
            transition-colors duration-150 ease-in-out
            ${active
                ? "bg-neutral-800 text-white"
                : "text-neutral-300 hover:bg-neutral-800/50 hover:text-neutral-200"
            }
        `

        const content = (
            <>
                <item.icon size={18} className="shrink-0" />
                {!collapsed && (
                    <>
                        <span className="flex-1">{item.label}</span>
                        {item.shortcut && (
                            <span className="text-xs text-neutral-500">{item.shortcut}</span>
                        )}
                    </>
                )}
            </>
        )

        if (item.href) {
            return (
                <Link
                    href={item.href}
                    className={baseClasses}
                    prefetch={true}
                    onMouseEnter={() => prefetchPageData(item.href!)}
                    onClick={() => {
                        if (onMobileSidebarClose) onMobileSidebarClose()
                    }}
                >
                    {content}
                </Link>
            )
        }

        return (
            <button type="button" onClick={item.onClick} className={`${baseClasses} w-full text-left`}>
                {content}
            </button>
        )
    }

    return (
        <>
            {/* Mobile backdrop */}
            {mobileSidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 md:hidden"
                    onClick={onMobileSidebarClose}
                    aria-hidden="true"
                />
            )}

            <aside
                className={`
                    flex flex-col bg-neutral-900 border-r border-neutral-800
                    transition-all duration-200 ease-in-out
                    ${collapsed && !mobileSidebarOpen ? "w-16" : "w-60"}

                    ${mobileSidebarOpen
                        ? "fixed inset-y-0 left-0 z-50 md:relative md:z-auto"
                        : "hidden md:flex"
                    }
                `}
            >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-neutral-800">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded bg-red-500 flex items-center justify-center shrink-0">
                        <span className="text-white text-sm font-bold">A</span>
                    </div>
                    {!collapsed && (
                        <span className="font-semibold text-white truncate">AssistenzPlus</span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => setCollapsed(!collapsed)}
                    className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors hidden md:block"
                    title={collapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
                    aria-label={collapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
                >
                    {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>
            </div>

            {/* Search (nur wenn nicht collapsed) */}
            {!collapsed && (
                <div className="p-3 border-b border-neutral-800">
                    <button
                        type="button"
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-neutral-500 bg-neutral-800/50 hover:bg-neutral-800 transition-colors"
                    >
                        <Search size={16} />
                        <span className="flex-1 text-left">Schnellsuche</span>
                        <span className="text-xs border border-neutral-700 rounded px-1.5 py-0.5">Strg K</span>
                    </button>
                </div>
            )}

            {/* Main Navigation */}
            <nav className="flex-1 p-3 space-y-1" aria-label="Hauptnavigation">
                {navItems.map((item) => (
                    <NavLink key={item.label} item={item} />
                ))}
            </nav>

            {/* Footer - User Info */}
            <div className="p-3 border-t border-neutral-800">
                {session?.user && (
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-600 flex items-center justify-center shrink-0">
                            <span className="text-white text-sm font-medium">
                                {session.user.name?.charAt(0).toUpperCase() || "U"}
                            </span>
                        </div>
                        {!collapsed && (
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">
                                    {session.user.name}
                                </p>
                                <p className="text-xs text-neutral-500 truncate">
                                    {session.user.email}
                                </p>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => signOut({ callbackUrl: "/login" })}
                            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-red-400 transition-colors shrink-0"
                            title="Abmelden"
                        >
                            <LogOut size={16} />
                        </button>
                    </div>
                )}
            </div>
            </aside>
        </>
    )
}
