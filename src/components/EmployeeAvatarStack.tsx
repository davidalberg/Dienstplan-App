"use client"

interface EmployeeAvatarStackProps {
    employees: Array<{ id: string; name: string }>
    maxVisible?: number
    size?: "sm" | "md"
}

/**
 * Displays a horizontal stack of employee avatars with overflow indicator.
 * Shows initials in colored circles with consistent color rotation.
 */
export default function EmployeeAvatarStack({
    employees,
    maxVisible = 3,
    size = "sm"
}: EmployeeAvatarStackProps) {
    const visibleEmployees = employees.slice(0, maxVisible)
    const remainingCount = Math.max(0, employees.length - maxVisible)

    // Avatar colors - consistent rotation based on index
    const avatarColors = [
        "bg-violet-600",
        "bg-blue-600",
        "bg-emerald-600",
        "bg-amber-600",
        "bg-rose-600",
        "bg-cyan-600"
    ]

    const getAvatarColor = (index: number) => {
        return avatarColors[index % avatarColors.length]
    }

    // Get initials from name
    const getInitials = (name: string): string => {
        const parts = name.trim().split(/\s+/)
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
        }
        return name.substring(0, 2).toUpperCase()
    }

    // Size classes
    const sizeClasses = {
        sm: {
            container: "w-8 h-8",
            text: "text-xs",
            font: "font-medium"
        },
        md: {
            container: "w-10 h-10",
            text: "text-sm",
            font: "font-semibold"
        }
    }

    const currentSize = sizeClasses[size]

    if (employees.length === 0) {
        return null
    }

    return (
        <div className="flex items-center -space-x-2">
            {visibleEmployees.map((employee, index) => (
                <div
                    key={employee.id}
                    className={`
                        ${currentSize.container}
                        ${getAvatarColor(index)}
                        rounded-full
                        flex items-center justify-center
                        border-2 border-neutral-900
                        ${currentSize.text}
                        ${currentSize.font}
                        text-white
                        transition-transform duration-150
                        hover:scale-110 hover:z-10
                        cursor-default
                    `}
                    title={employee.name}
                >
                    {getInitials(employee.name)}
                </div>
            ))}

            {remainingCount > 0 && (
                <div
                    className={`
                        ${currentSize.container}
                        bg-neutral-700
                        rounded-full
                        flex items-center justify-center
                        border-2 border-neutral-900
                        ${currentSize.text}
                        ${currentSize.font}
                        text-neutral-300
                        cursor-default
                    `}
                    title={`+${remainingCount} weitere Mitarbeiter`}
                >
                    +{remainingCount}
                </div>
            )}
        </div>
    )
}
