"use client"

import { useState, useEffect } from "react"
import { format, differenceInDays, parseISO } from "date-fns"
import { de } from "date-fns/locale"
import { CheckCircle, XCircle, AlertCircle, Filter } from "lucide-react"
import { Sidebar } from "@/components/Sidebar"

interface VacationRequest {
  id: string
  startDate: string
  endDate: string
  reason: string | null
  status: "PENDING" | "APPROVED" | "REJECTED"
  approvedBy: string | null
  approvedAt: string | null
  createdAt: string
  employee: {
    id: string
    name: string
    email: string
  }
  approver?: {
    name: string
  } | null
}

export default function AdminVacationRequestsPage() {
  const [requests, setRequests] = useState<VacationRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<"all" | "PENDING" | "APPROVED" | "REJECTED">("PENDING")
  const [processingId, setProcessingId] = useState<string | null>(null)

  useEffect(() => {
    fetchRequests()
  }, [statusFilter])

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/vacation-requests?status=${statusFilter}`)
      if (res.ok) {
        const data = await res.json()
        setRequests(data)
      }
    } catch (err) {
      console.error("Failed to fetch vacation requests", err)
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (requestId: string, action: "APPROVE" | "REJECT") => {
    setProcessingId(requestId)
    try {
      const res = await fetch(`/api/admin/vacation-requests/${requestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      })

      if (!res.ok) {
        const error = await res.json()
        alert(error.error || "Fehler beim Bearbeiten des Antrags")
        return
      }

      // Refresh list
      fetchRequests()
    } catch (err) {
      console.error("Failed to process request", err)
      alert("Fehler beim Bearbeiten des Antrags")
    } finally {
      setProcessingId(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-900/30 px-3 py-1 text-xs font-medium text-yellow-400">
            <AlertCircle size={14} />
            Ausstehend
          </span>
        )
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-900/30 px-3 py-1 text-xs font-medium text-green-400">
            <CheckCircle size={14} />
            Genehmigt
          </span>
        )
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-900/30 px-3 py-1 text-xs font-medium text-red-400">
            <XCircle size={14} />
            Abgelehnt
          </span>
        )
      default:
        return null
    }
  }

  const pendingCount = requests.filter((r) => r.status === "PENDING").length

  return (
    <div className="flex min-h-screen bg-neutral-950">
      <Sidebar />
      <div className="flex-1 p-8 ml-64">
        <div className="mx-auto max-w-7xl">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white">Urlaubsanträge</h1>
            <p className="text-neutral-400 mt-2">
              Verwalte und genehmige Urlaubsanträge deiner Mitarbeiter
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="mb-6 flex items-center gap-2">
            <Filter size={20} className="text-neutral-400" />
            <div className="flex gap-2">
              <button
                onClick={() => setStatusFilter("PENDING")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  statusFilter === "PENDING"
                    ? "bg-violet-600 text-white"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                }`}
              >
                Ausstehend {pendingCount > 0 && `(${pendingCount})`}
              </button>
              <button
                onClick={() => setStatusFilter("all")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  statusFilter === "all"
                    ? "bg-violet-600 text-white"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                }`}
              >
                Alle
              </button>
              <button
                onClick={() => setStatusFilter("APPROVED")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  statusFilter === "APPROVED"
                    ? "bg-violet-600 text-white"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                }`}
              >
                Genehmigt
              </button>
              <button
                onClick={() => setStatusFilter("REJECTED")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  statusFilter === "REJECTED"
                    ? "bg-violet-600 text-white"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                }`}
              >
                Abgelehnt
              </button>
            </div>
          </div>

          {/* Requests Table */}
          <div className="rounded-xl bg-neutral-900 overflow-hidden">
            {loading ? (
              <div className="py-12 text-center text-neutral-400">Lade Daten...</div>
            ) : requests.length === 0 ? (
              <div className="py-12 text-center text-neutral-500">
                Keine Urlaubsanträge gefunden
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-neutral-800">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-medium text-neutral-400">
                        Mitarbeiter
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-neutral-400">
                        Zeitraum
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-neutral-400">
                        Tage
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-neutral-400">
                        Grund
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-neutral-400">
                        Status
                      </th>
                      <th className="px-6 py-4 text-right text-sm font-medium text-neutral-400">
                        Aktionen
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {requests.map((request) => {
                      const days = differenceInDays(parseISO(request.endDate), parseISO(request.startDate)) + 1
                      const isProcessing = processingId === request.id

                      return (
                        <tr
                          key={request.id}
                          className="hover:bg-neutral-800/50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div>
                              <p className="font-medium text-white">{request.employee.name}</p>
                              <p className="text-sm text-neutral-400">{request.employee.email}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-white">
                            <p className="font-medium">
                              {format(parseISO(request.startDate), "dd.MM.yyyy", { locale: de })}
                            </p>
                            <p className="text-sm text-neutral-400">
                              bis {format(parseISO(request.endDate), "dd.MM.yyyy", { locale: de })}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center rounded-full bg-neutral-800 px-3 py-1 text-sm font-medium text-white">
                              {days} {days === 1 ? "Tag" : "Tage"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-neutral-400 max-w-xs truncate">
                            {request.reason || "-"}
                          </td>
                          <td className="px-6 py-4">
                            <div>
                              {getStatusBadge(request.status)}
                              {request.approver && request.approvedAt && (
                                <p className="text-xs text-neutral-500 mt-1">
                                  von {request.approver.name}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {request.status === "PENDING" && (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleAction(request.id, "APPROVE")}
                                  disabled={isProcessing}
                                  className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-neutral-700 disabled:text-neutral-500 transition-colors"
                                >
                                  <CheckCircle size={16} />
                                  Genehmigen
                                </button>
                                <button
                                  onClick={() => handleAction(request.id, "REJECT")}
                                  disabled={isProcessing}
                                  className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:bg-neutral-700 disabled:text-neutral-500 transition-colors"
                                >
                                  <XCircle size={16} />
                                  Ablehnen
                                </button>
                              </div>
                            )}
                            {request.status !== "PENDING" && (
                              <span className="text-sm text-neutral-500">-</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
