import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useAgentConfig, useToolRegistry, useUpdateAgentConfig } from "@/hooks/useAgentConfig"
import type { ModuleInfo } from "@/types/api"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { SchemaForm, type ConfigValues } from "@/components/tools/SchemaForm"

function ModuleCard({ module }: { module: ModuleInfo }) {
  const { t } = useTranslation()
  const { data: config } = useAgentConfig()
  const updateConfig = useUpdateAgentConfig()

  const [draft, setDraft] = useState<ConfigValues | null>(null)
  const values = draft ?? module.config ?? {}
  const isDirty = draft !== null

  const writeEnabled = async (changes: Record<string, boolean>) => {
    if (!config) return
    try {
      // Replace-the-map semantics: send everything we loaded, flip some keys.
      // Missing key = enabled, so we always write keys explicitly.
      await updateConfig.mutateAsync({
        enabled_tools: { ...config.enabled_tools, ...changes },
      })
      toast.success(t("tools.saved"))
    } catch {
      toast.error(t("tools.saveError"))
    }
  }

  const handleToggle = (toolName: string, enabled: boolean) =>
    writeEnabled({ [toolName]: enabled })

  // Module-level kill switch: flips every tool in the module at once
  const allEnabled = module.tools.every((tool) => tool.enabled)
  const handleToggleModule = (enabled: boolean) =>
    writeEnabled(Object.fromEntries(module.tools.map((tool) => [tool.name, enabled])))

  const handleSaveConfig = async () => {
    if (!config || draft === null) return
    try {
      await updateConfig.mutateAsync({
        tool_config: { ...config.tool_config, [module.config_key]: draft },
      })
      setDraft(null)
      toast.success(t("tools.saved"))
    } catch {
      toast.error(t("tools.saveError"))
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="font-mono text-lg">{module.name}</CardTitle>
            <CardDescription>
              {t("tools.module")} · {module.tools.length} tool
              {module.tools.length === 1 ? "" : "s"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t("tools.wholeModule")}
            </span>
            <Switch
              checked={allEnabled}
              onCheckedChange={handleToggleModule}
              disabled={updateConfig.isPending}
              aria-label={`${module.name} — ${t("tools.wholeModule")}`}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="space-y-3">
          {module.tools.map((tool) => (
            <li key={tool.name} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-medium">{tool.name}</code>
                  <StatusBadge
                    isActive={tool.enabled}
                    activeLabel={t("tools.enabled")}
                    inactiveLabel={t("tools.disabled")}
                  />
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {tool.description.split("\n")[0]}
                </p>
              </div>
              <Switch
                checked={tool.enabled}
                onCheckedChange={(checked) => handleToggle(tool.name, checked)}
                disabled={updateConfig.isPending}
                aria-label={tool.name}
              />
            </li>
          ))}
        </ul>

        {module.config_schema ? (
          <div className="space-y-4 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">{t("tools.settings")}</h3>
            <SchemaForm
              schema={module.config_schema}
              values={values}
              onChange={setDraft}
              idPrefix={module.name}
            />
            <Button
              size="sm"
              onClick={handleSaveConfig}
              disabled={!isDirty || updateConfig.isPending}
            >
              {updateConfig.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        ) : (
          <p className="border-t border-border pt-4 text-xs text-muted-foreground">
            {t("tools.noConfig")}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function ToolsPage() {
  const { t } = useTranslation()
  const { data, isLoading } = useToolRegistry()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("tools.title")}</h1>
        <p className="text-muted-foreground">{t("tools.subtitle")}</p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data?.modules.map((module) => (
            <ModuleCard key={module.name} module={module} />
          ))}
        </div>
      )}
    </div>
  )
}
