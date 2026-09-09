import { useTranslation } from "react-i18next"
import { ExternalLink } from "lucide-react"
import { useMediaUrl } from "@/hooks/useMediaUrl"
import type { MessageItem } from "@/types/api"

/**
 * Renders a message's stored media (ADR-003): inline <img> for images,
 * <audio controls> for audio, an "open file" link for anything else.
 * Fetches the short-lived presigned URL via the JWT'd media endpoint —
 * <img src> can't send Authorization headers, so the hook does.
 * On error it renders nothing: the bubble's type badge stays as fallback.
 */
export function MessageMedia({ message }: { message: MessageItem }) {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useMediaUrl(message.id, message.has_media)

  if (!message.has_media || isError) return null

  if (isLoading || !data) {
    return (
      <div className="my-1 h-24 w-40 animate-pulse rounded-md bg-foreground/10" />
    )
  }

  if (message.type === "image") {
    return (
      <a href={data.url} target="_blank" rel="noreferrer" className="block">
        <img
          src={data.url}
          alt={t("conversations.mediaImageAlt")}
          className="my-1 max-h-64 max-w-full rounded-md object-contain"
          loading="lazy"
        />
      </a>
    )
  }

  if (message.type === "audio") {
    return <audio controls src={data.url} className="my-1 w-60 max-w-full" />
  }

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noreferrer"
      className="my-1 flex items-center gap-1 text-xs underline underline-offset-2"
    >
      <ExternalLink className="h-3 w-3" />
      {typeof message.meta.filename === "string"
        ? message.meta.filename
        : t("conversations.mediaOpen")}
    </a>
  )
}
