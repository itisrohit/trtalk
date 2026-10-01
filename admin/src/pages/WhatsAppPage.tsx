import { useCallback, useEffect, useState } from "react"
import { LogOut, RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const evolutionUrl = import.meta.env.VITE_EVOLUTION_API_URL || "http://localhost:8080"
const evolutionApiKey = import.meta.env.VITE_EVOLUTION_API_KEY || "dev-evolution-key"
const instanceName = "agproto"

type ConnectionResponse = { instance?: { state?: string } }
type ConnectResponse = {
  base64?: string | null
  instance?: { state?: string }
}

async function evolutionFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${evolutionUrl}${path}`, {
    headers: { apikey: evolutionApiKey },
  })
  if (!response.ok) throw new Error(`Evolution API returned ${response.status}`)
  return response.json() as Promise<T>
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

  const refreshState = useCallback(async () => {
    try {
      const result = await evolutionFetch<ConnectionResponse>(`/instance/connectionState/${instanceName}`)
      setState(result.instance?.state ?? "unknown")
      if (result.instance?.state === "open") {
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
      const result = await evolutionFetch<ConnectResponse>(`/instance/connect/${instanceName}`)
      setQr(result.base64 ?? null)
      if (!result.base64 && result.instance?.state === "open") {
        setState("open")
        setNotice(t("whatsapp.alreadyConnected"))
      } else if (!result.base64) {
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
      const response = await fetch(`${evolutionUrl}/instance/restart/${instanceName}`, {
        method: "POST",
        headers: { apikey: evolutionApiKey },
      })
      if (!response.ok) throw new Error(`Evolution API returned ${response.status}`)
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
    if (!window.confirm(t("whatsapp.disconnectConfirm"))) return
    setDisconnecting(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`${evolutionUrl}/instance/logout/${instanceName}`, {
        method: "POST",
        headers: { apikey: evolutionApiKey },
      })
      if (!response.ok) throw new Error(`Evolution API returned ${response.status}`)
      setState("close")
      setQr(null)
      setNotice(t("whatsapp.disconnected"))
    } catch {
      setError(t("whatsapp.disconnectError"))
    } finally {
      setDisconnecting(false)
    }
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
              <Button variant="destructive" onClick={disconnect} disabled={disconnecting || retryingHistory}>
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
    </div>
  )
}
