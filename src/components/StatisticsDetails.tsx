"use client"

import { Moon, Sun, Calendar, Shield, HeartPulse, Palmtree } from "lucide-react"

interface StatisticsDetailsProps {
  stats: {
    nightHours: number
    sundayHours: number
    holidayHours: number
    backupDays: number
    sickDays: number
    sickHours: number
    vacationDays: number
    vacationHours: number
  }
  variant?: 'compact' | 'detailed'
}

export default function StatisticsDetails({
  stats,
  variant = 'compact'
}: StatisticsDetailsProps) {
  if (variant === 'compact') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-xl">
        <StatItem
          icon={<Moon size={16} />}
          label="Nachtstunden"
          value={`${stats.nightHours.toFixed(1)} Std`}
          color="purple"
        />
        <StatItem
          icon={<Sun size={16} />}
          label="Sonntagsstunden"
          value={`${stats.sundayHours.toFixed(1)} Std`}
          color="blue"
        />
        <StatItem
          icon={<Calendar size={16} />}
          label="Feiertagsstunden"
          value={`${stats.holidayHours.toFixed(1)} Std`}
          color="red"
        />
        <StatItem
          icon={<Shield size={16} />}
          label="BackUp-Tage"
          value={stats.backupDays}
          color="orange"
        />
        <StatItem
          icon={<HeartPulse size={16} />}
          label="Krankmeldung"
          value={`${stats.sickDays} Tage (${stats.sickHours.toFixed(1)} Std)`}
          color="red"
        />
        <StatItem
          icon={<Palmtree size={16} />}
          label="Urlaub"
          value={`${stats.vacationDays} Tage (${stats.vacationHours.toFixed(1)} Std)`}
          color="green"
        />
      </div>
    )
  }

  // 'detailed' variant - Karten-Layout für Admin
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-6">
        <DetailCard
          label="Nachtstunden"
          value={`${stats.nightHours.toFixed(1)} Std`}
          color="purple"
        />
        <DetailCard
          label="Sonntagsstunden"
          value={`${stats.sundayHours.toFixed(1)} Std`}
          color="blue"
        />
        <DetailCard
          label="Feiertagsstunden"
          value={`${stats.holidayHours.toFixed(1)} Std`}
          color="red"
        />
      </div>
      <div className="grid grid-cols-3 gap-6">
        <DetailCard
          label="Krankmeldung"
          value={`${stats.sickDays} Tage`}
          subValue={`${stats.sickHours.toFixed(1)} Std`}
          color="red"
        />
        <DetailCard
          label="Urlaub"
          value={`${stats.vacationDays} Tage`}
          subValue={`${stats.vacationHours.toFixed(1)} Std`}
          color="green"
        />
        <DetailCard
          label="BackUp-Tage"
          value={stats.backupDays}
          color="orange"
        />
      </div>
    </div>
  )
}

// Helper-Komponenten
function StatItem({ icon, label, value, color }: {
  icon: React.ReactNode
  label: string
  value: string | number
  color: string
}) {
  const colorClasses: Record<string, string> = {
    purple: 'text-purple-600',
    blue: 'text-blue-600',
    red: 'text-red-600',
    orange: 'text-orange-600',
    green: 'text-green-600'
  }

  return (
    <div className="flex items-center gap-3">
      <div className={colorClasses[color] || 'text-gray-600'}>{icon}</div>
      <div>
        <p className="text-xs text-gray-600">{label}</p>
        <p className="text-sm font-bold text-gray-900">{value}</p>
      </div>
    </div>
  )
}

function DetailCard({ label, value, subValue, color }: {
  label: string
  value: string | number
  subValue?: string
  color: string
}) {
  const colorClasses: Record<string, { bg: string, text: string }> = {
    purple: { bg: 'bg-purple-50', text: 'text-purple-900' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-900' },
    red: { bg: 'bg-red-50', text: 'text-red-900' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-900' },
    green: { bg: 'bg-green-50', text: 'text-green-900' }
  }

  const colors = colorClasses[color] || { bg: 'bg-gray-50', text: 'text-gray-900' }

  return (
    <div className={`rounded-xl ${colors.bg} p-4`}>
      <p className={`text-xs font-black uppercase ${colors.text} mb-2`}>
        {label}
      </p>
      <p className={`text-2xl font-black ${colors.text}`}>
        {value}
      </p>
      {subValue && (
        <p className={`text-xs ${colors.text} mt-1 opacity-70`}>
          {subValue}
        </p>
      )}
    </div>
  )
}
