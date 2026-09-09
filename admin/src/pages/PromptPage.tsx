import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useAgentConfig, useUpdateAgentConfig } from "@/hooks/useAgentConfig"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

export function PromptPage() {
  const { t, i18n } = useTranslation()
  const { data: config, isLoading } = useAgentConfig()
  const updateConfig = useUpdateAgentConfig()

  // null = pristine (render the server value); string = the operator's edit
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? config?.system_prompt ?? ""
  const isDirty = config != null && draft !== null && draft !== config.system_prompt

  const handleSave = async () => {
    if (draft === null) return
    try {
      await updateConfig.mutateAsync({ system_prompt: draft })
      setDraft(null) // back to pristine — the cache now holds the saved value
      toast.success(t("prompt.saved"))
    } catch {
      toast.error(t("prompt.saveError"))
    }
  }

  if (isLoading || config == null) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("prompt.title")}</h1>
          <p className="text-muted-foreground">{t("prompt.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {isDirty && <Badge variant="outline">{t("prompt.unsavedChanges")}</Badge>}
          <Button onClick={handleSave} disabled={!isDirty || updateConfig.isPending}>
            {updateConfig.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Textarea
            value={value}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={t("prompt.label")}
            className="min-h-[420px] font-mono text-sm leading-relaxed"
            spellCheck={false}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            {t("prompt.lastUpdated", {
              date: new Date(config.updated_at + "Z").toLocaleString(i18n.language),
            })}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
