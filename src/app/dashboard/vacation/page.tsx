"use client"

import { useSession } from "next-auth/react"
import { useState, useEffect } from "react"
import { format, differenceInDays, parseISO } from "date-fns"
import { de } from "date-fns/locale"
import { Calendar, Clock, ArrowLeft, CheckCircle, XCircle, AlertCircle } from "lucide-react"
import { useRouter } from "next/navigation"

interface VacationRequest {
  id: string
  startDate: string
  endDate: string
  reason: string | null
  status: "PENDING" | "APPROVED" | "REJECTED"
  approvedBy: string | null
  approvedAt: string | null
  createdAt: string
  approver?: {
    name: string
  } | null
}

interface VacationQuota {
  id: string
  year: number
  totalDays: number
  usedDays: number
}

export default function VacationRequestPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [requests, setRequests] = useState<VacationRequest[]>([])
  const [quota, setQuota] = useState<VacationQuota | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (session) {
      fetchData()
    }
  }, [session])

  const fetchData = async () => {
    try {
      const res = await fetch("/api/vacation-requests")
      if (res.ok) {
        const data = await res.json()
        setRequests(data.requests || [])
        setQuota(data.quota || null)
      }
    } catch (err) {
      console.error("Failed to fetch vacation data", err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSubmitting(true)

    // Validation
    if (!startDate || !endDate) {
      setError("Bitte Start- und Enddatum auswählen")
      setSubmitting(false)
      return
    }

    const start = parseISO(startDate)
    const end = parseISO(endDate)

    if (end < start) {
      setError("Enddatum muss nach dem Startdatum liegen")
      setSubmitting(false)
      return
    }

    const requestedDays = differenceInDays(end, start) + 1

    if (quota && requestedDays > (quota.totalDays - quota.usedDays)) {
      setError(`Nicht genügend Urlaubstage verfügbar (verbleibend: ${quota.totalDays - quota.usedDays})`)
      setSubmitting(false)
      return
    }

    try {
      const res = await fetch("/api/vacation-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, reason: reason.trim() || null })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Fehler beim Erstellen des Antrags")
      }

      // Reset form
      setStartDate("")
      setEndDate("")
      setReason("")
      fetchData()
    } catch (err: any) {
      setError(err.message || "Fehler beim Erstellen des Antrags")
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800">
            <AlertCircle size={14} />
            Ausstehend
          </span>
        )
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
            <CheckCircle size={14} />
            Genehmigt
          </span>
        )
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800">
            <XCircle size={14} />
            Abgelehnt
          </span>
        )
      default:
        return null
    }
  }

  if (!session) return null

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="sticky top-0 z-10 border-b bg-white p-4 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-black">Urlaubsantrag</h1>
            <p className="text-sm text-gray-600">Urlaubstage beantragen und verwalten</p>
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
          >
            <ArrowLeft size={16} />
            Zurück
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 space-y-6">
        {/* Quota Card */}
        {quota && (
          <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-black">Urlaubskontingent {quota.year}</h2>
              <Calendar className="text-blue-600" size={24} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Gesamt</p>
                <p className="text-2xl font-bold text-black">{quota.totalDays}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Verbraucht</p>
                <p className="text-2xl font-bold text-orange-600">{quota.usedDays}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Verbleibend</p>
                <p className="text-2xl font-bold text-green-600">{quota.totalDays - quota.usedDays}</p>
              </div>
            </div>
            {/* Progress Bar */}
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${Math.min((quota.usedDays / quota.totalDays) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* New Request Form */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-bold text-black mb-4">Neuer Urlaubsantrag</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-800">
                {error}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Startdatum
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Enddatum
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Grund (optional)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="z.B. Familienurlaub, persönliche Angelegenheiten..."
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-black placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
              />
            </div>
            {startDate && endDate && parseISO(endDate) >= parseISO(startDate) && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                <p className="text-sm text-blue-800">
                  <Clock size={16} className="inline mr-2" />
                  Anzahl Tage: <span className="font-bold">{differenceInDays(parseISO(endDate), parseISO(startDate)) + 1}</span>
                </p>
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
            >
              {submitting ? "Wird eingereicht..." : "Urlaubsantrag einreichen"}
            </button>
          </form>
        </div>

        {/* Requests List */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-bold text-black mb-4">Meine Urlaubsanträge</h2>
          {loading ? (
            <div className="py-8 text-center text-gray-600">Lade Daten...</div>
          ) : requests.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              Noch keine Urlaubsanträge vorhanden
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((request) => {
                const days = differenceInDays(parseISO(request.endDate), parseISO(request.startDate)) + 1
                return (
                  <div
                    key={request.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <p className="font-medium text-black">
                          {format(parseISO(request.startDate), "dd.MM.yyyy", { locale: de })} - {format(parseISO(request.endDate), "dd.MM.yyyy", { locale: de })}
                        </p>
                        {getStatusBadge(request.status)}
                      </div>
                      <p className="text-sm text-gray-600">
                        {days} {days === 1 ? "Tag" : "Tage"}
                        {request.reason && ` • ${request.reason}`}
                      </p>
                      {request.status === "APPROVED" && request.approver && (
                        <p className="text-xs text-green-600 mt-1">
                          Genehmigt von {request.approver.name} am {format(parseISO(request.approvedAt!), "dd.MM.yyyy HH:mm", { locale: de })}
                        </p>
                      )}
                      {request.status === "REJECTED" && request.approver && (
                        <p className="text-xs text-red-600 mt-1">
                          Abgelehnt von {request.approver.name} am {format(parseISO(request.approvedAt!), "dd.MM.yyyy HH:mm", { locale: de })}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
