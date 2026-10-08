import { useCallback, useEffect, useState } from "react"
import { LogOut, RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { apiClient } from "@/lib/api-client"

// The core forwards these to the WhatsApp gateway (admin JWT required), so
// the provider's credentials never ship in this bundle.
type Connection = { state: string; qr: string | null }
type ConnectionAction = "connect" | "restart" | "logout"

const CONNECTION_PATH = "/admin/channels/whatsapp/connection"

async function getConnection(): Promise<Connection> {
  return (await apiClient.get<Connection>(CONNECTION_PATH)).data
}

async function changeConnection(action: ConnectionAction): Promise<Connection> {
  return (await apiClient.post<Connection>(`${CONNECTION_PATH}/${action}`)).data
}

export function WhatsAppPage() {
  const { t } = useTranslation()
  const [state, setState] = useState("unknown")
  const [qr, setQr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [retryingHistory, setRetryingHistory] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [deleteHistory, setDeleteHistory] = useState(false)
  const queryClient = useQueryClient()

  const refreshState = useCallback(async () => {
    try {
      const result = await getConnection()
      setState(result.state)
      if (result.state === "open") {
        setQr(null)
        setNotice(null)
      }
    } catch {
      setState("unavailable")
    }
  }, [])

  const generateQr = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await changeConnection("connect")
      setQr(result.qr)
      if (!result.qr && result.state === "open") {
        setState("open")
        setNotice(t("whatsapp.alreadyConnected"))
      } else if (!result.qr) {
        setNotice(t("whatsapp.qrWaiting"))
      } else {
        setNotice(null)
      }
      await refreshState()
    } catch {
      setError(t("whatsapp.error"))
    } finally {
      setLoading(false)
    }
  }

  const retryHistorySync = async () => {
    if (!window.confirm(t("whatsapp.retryHistoryConfirm"))) return
    setRetryingHistory(true)
    setError(null)
    setNotice(null)
    try {
      await changeConnection("restart")
      setState("connecting")
      setQr(null)
      setNotice(t("whatsapp.retryHistoryStarted"))
    } catch {
      setError(t("whatsapp.retryHistoryError"))
    } finally {
      setRetryingHistory(false)
    }
  }

  const disconnect = async () => {
    setDisconnecting(true)
    setError(null)
    setNotice(null)
    try {
      await changeConnection("logout")
      setState("close")
      setQr(null)
      setNotice(t("whatsapp.disconnected"))
    } catch {
      setError(t("whatsapp.disconnectError"))
      setDisconnecting(false)
      setConfirmDisconnect(false)
      return
    }
    // History is deleted only after a successful logout, and only if asked.
    if (deleteHistory) {
      try {
        const { data } = await apiClient.delete<{ deleted_contacts: number }>("/admin/contacts", {
          params: { channel: "whatsapp" },
        })
        setNotice(t("whatsapp.disconnectedAndDeleted", { count: data.deleted_contacts }))
        await queryClient.invalidateQueries({ queryKey: ["contacts"] })
        await queryClient.invalidateQueries({ queryKey: ["leads"] })
      } catch {
        setError(t("whatsapp.deleteHistoryError"))
      }
    }
    setDisconnecting(false)
    setConfirmDisconnect(false)
    setDeleteHistory(false)
  }

  useEffect(() => {
    void refreshState()
  }, [refreshState])

  // Restarting an existing Evolution session is asynchronous. Keep the
  // status current so the page does not remain stuck on "Connecting" and so
  // a QR delivered shortly after the request can be displayed.
  useEffect(() => {
    if (state !== "connecting" && state !== "qr") return
    const timer = window.setInterval(() => {
      void refreshState()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [state, refreshState])

  const connected = state === "open"

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("whatsapp.title")}</h1>
        <p className="text-muted-foreground">{t("whatsapp.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            {t("whatsapp.connection")}
            <Badge variant={connected ? "default" : "outline"}>
              {t(`whatsapp.states.${state}`, { defaultValue: state })}
            </Badge>
          </CardTitle>
          <CardDescription>{t("whatsapp.instructions")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!connected && qr && (
            <div className="flex justify-center rounded-lg border bg-white p-5">
              <img src={qr} alt={t("whatsapp.qrAlt")} className="h-80 w-80" />
            </div>
          )}
          {!connected && !qr && <p className="text-sm text-muted-foreground">{t("whatsapp.noQr")}</p>}
          {connected && <p className="text-sm text-green-700">{t("whatsapp.connected")}</p>}
          {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-3">
            {connected && (
              <Button variant="outline" onClick={retryHistorySync} disabled={retryingHistory || disconnecting}>
                <RefreshCw className={retryingHistory ? "animate-spin" : ""} />
                {retryingHistory ? t("whatsapp.retryingHistory") : t("whatsapp.retryHistory")}
              </Button>
            )}
            {connected && (
              <Button
                variant="destructive"
                onClick={() => setConfirmDisconnect(true)}
                disabled={disconnecting || retryingHistory}
              >
                <LogOut />
                {disconnecting ? t("whatsapp.disconnecting") : t("whatsapp.disconnect")}
              </Button>
            )}
            {!connected && (
              <Button onClick={generateQr} disabled={loading}>
                <RefreshCw className={loading ? "animate-spin" : ""} />
                {loading ? t("whatsapp.generating") : t("whatsapp.generateQr")}
              </Button>
            )}
            <Button variant="outline" onClick={() => void refreshState()}>
              <RefreshCw /> {t("whatsapp.refresh")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={(open) => {
          setConfirmDisconnect(open)
          if (!open) setDeleteHistory(false)
        }}
        title={t("whatsapp.disconnectTitle")}
        description={t("whatsapp.disconnectConfirm")}
        confirmLabel={t("whatsapp.disconnect")}
        onConfirm={() => void disconnect()}
        isLoading={disconnecting}
        variant="destructive"
      >
        <div className="flex items-start gap-3 rounded-md border p-3">
          <Switch
            id="delete-history"
            checked={deleteHistory}
            onCheckedChange={setDeleteHistory}
            disabled={disconnecting}
          />
          <div className="space-y-1">
            <Label htmlFor="delete-history">{t("whatsapp.deleteHistory")}</Label>
            <p className="text-sm text-muted-foreground">{t("whatsapp.deleteHistoryHint")}</p>
          </div>
        </div>
      </ConfirmDialog>
    </div>
  )
}
