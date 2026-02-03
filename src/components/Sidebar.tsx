"use client"

import { useSession, signOut } from "next-auth/react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { useState, useCallback } from "react"
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
    Palmtree
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
}

export function Sidebar({ onExportClick }: SidebarProps) {
    const { data: session } = useSession()
    const pathname = usePathname()
    const [collapsed, setCollapsed] = useState(false)

    const navItems: NavItem[] = [
        { icon: Calendar, label: "Kalender", href: "/admin/schedule" },
        { icon: UserCog, label: "Assistenten", href: "/admin/assistants" },
        { icon: UserCircle, label: "Klienten", href: "/admin/clients" },
        { icon: FileText, label: "Stundennachweise", href: "/admin/timesheets" },
        { icon: Palmtree, label: "Urlaub / Krank", href: "/admin/vacations" },
        { icon: Wallet, label: "Lohnliste", href: "/admin/payroll" },
        { icon: Settings, label: "Einstellungen", href: "/admin/settings" },
    ]

    const isActive = (href?: string) => {
        if (!href) return false
        if (href === "/admin") return pathname === "/admin"
        return pathname.startsWith(href)
    }

    // Prefetch data on hover
    const prefetchData = useCallback((href: string) => {
        const now = new Date()
        const month = now.getMonth() + 1
        const year = now.getFullYear()

        // Map routes to their API endpoints
        const routeToApi: Record<string, string> = {
            "/admin/schedule": `/api/admin/schedule?month=${month}&year=${year}`,
            "/admin/assistants": "/api/admin/employees",
            "/admin/clients": "/api/clients",
            "/admin/timesheets": `/api/admin/timesheets?month=${month}&year=${year}`,
            "/admin/vacations": `/api/admin/vacations/absences?month=${month}&year=${year}`,
            "/admin/payroll": `/api/admin/payroll?month=${month}&year=${year}`,
        }

        const apiUrl = routeToApi[href]
        if (apiUrl) {
            fetch(apiUrl).catch(() => {}) // Silent prefetch
        }
    }, [])

    const NavLink = ({ item }: { item: NavItem }) => {
        const active = isActive(item.href)
        const baseClasses = `
            flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium
            transition-colors duration-150 ease-in-out
            ${active
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
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
                    onMouseEnter={() => prefetchData(item.href!)}
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
        <aside
            className={`
                flex flex-col bg-neutral-900 border-r border-neutral-800
                transition-all duration-200 ease-in-out
                ${collapsed ? "w-16" : "w-60"}
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
                    className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                    title={collapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
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
            <nav className="flex-1 p-3 space-y-1">
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
    )
}
