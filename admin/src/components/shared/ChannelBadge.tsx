import type { IconType } from "react-icons"
import { SiTelegram, SiWhatsapp } from "react-icons/si"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// Known channels → brand glyph (Simple Icons, official logos) + CSS token.
// Unknown channels fall back to a neutral outline badge.
const CHANNELS: Record<string, { Icon: IconType; token: string }> = {
  whatsapp: { Icon: SiWhatsapp, token: "--channel-whatsapp" },
  telegram: { Icon: SiTelegram, token: "--channel-telegram" },
}

export function channelIcon(channel: string): IconType | null {
  return CHANNELS[channel]?.Icon ?? null
}

export function ChannelBadge({
  channel,
  className,
}: {
  channel: string
  className?: string
}) {
  const { t } = useTranslation()
  const label = t(`conversations.channel.${channel}`, { defaultValue: channel })
  const meta = CHANNELS[channel]

  if (!meta) {
    return (
      <Badge variant="outline" className={cn("shrink-0 text-xs", className)}>
        {label}
      </Badge>
    )
  }

  const { Icon, token } = meta
  // Subtle tint from the brand token (category chip, not a CTA).
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium",
        className
      )}
      style={{
        color: `var(${token})`,
        backgroundColor: `color-mix(in srgb, var(${token}) 12%, transparent)`,
        borderColor: `color-mix(in srgb, var(${token}) 28%, transparent)`,
      }}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  )
}
