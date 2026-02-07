"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { CalendarDays, Clock, User } from "lucide-react"

const navItems = [
    { href: "/dashboard", label: "Schichten", icon: CalendarDays },
    { href: "/dashboard/history", label: "Verlauf", icon: Clock },
    { href: "/dashboard/profile", label: "Profil", icon: User },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()

    return (
        <div className="min-h-screen bg-gray-50">
            {children}

            {/* Bottom Navigation */}
            <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
                <div className="mx-auto flex max-w-2xl items-center justify-around">
                    {navItems.map((item) => {
                        const isActive = item.href === "/dashboard"
                            ? pathname === "/dashboard"
                            : pathname.startsWith(item.href)
                        const Icon = item.icon

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors ${
                                    isActive
                                        ? "text-blue-600 font-medium"
                                        : "text-gray-400 hover:text-gray-600"
                                }`}
                            >
                                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                                <span>{item.label}</span>
                            </Link>
                        )
                    })}
                </div>
            </nav>
        </div>
    )
}
