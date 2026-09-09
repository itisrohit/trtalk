import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { ChevronRight, MessageSquare, Siren } from "lucide-react"
import { useContacts } from "@/hooks/useContacts"
import type { ContactListItem } from "@/types/api"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChannelBadge, channelIcon } from "@/components/shared/ChannelBadge"
import { Card, CardContent } from "@/components/ui/card"
import { Pagination } from "@/components/shared/Pagination"
import { SearchInput } from "@/components/shared/SearchInput"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 25

// Live channels offered as filter chips (others still render via ChannelBadge).
const CHANNEL_FILTERS = ["whatsapp", "telegram"] as const

function initials(contact: ContactListItem): string {
  const name = contact.display_name ?? contact.external_id
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function ConversationsPage() {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [searchParams, setSearchParams] = useSearchParams()
  const humanOnly = searchParams.get("mode") === "human"
  const channel = searchParams.get("channel") ?? undefined

  const { data, isLoading } = useContacts(
    {
      search: search || undefined,
      mode: humanOnly ? "human" : undefined,
      channel,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    },
    { poll: true }
  )
  // Waiting-for-human counter for the tab badge (cheap: total only)
  const { data: humanCount } = useContacts({ mode: "human", limit: 1 }, { poll: true })

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))

  // Mode and channel filters coexist in the query string.
  const updateParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setSearchParams(next)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("conversations.title")}</h1>
        <p className="text-muted-foreground">{t("conversations.subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-md border border-border p-1">
          <Button
            variant={humanOnly ? "ghost" : "secondary"}
            size="sm"
            onClick={() => updateParams({ mode: null })}
          >
            {t("conversations.filterAll")}
          </Button>
          <Button
            variant={humanOnly ? "secondary" : "ghost"}
            size="sm"
            onClick={() => updateParams({ mode: "human" })}
          >
            <Siren className="mr-1 h-3.5 w-3.5" />
            {t("conversations.filterHuman")}
            {(humanCount?.total ?? 0) > 0 && (
              <Badge variant="destructive" className="ml-1.5 px-1.5 text-[10px]">
                {humanCount?.total}
              </Badge>
            )}
          </Button>
        </div>

        <div className="flex gap-1 rounded-md border border-border p-1">
          <Button
            variant={channel ? "ghost" : "secondary"}
            size="sm"
            onClick={() => updateParams({ channel: null })}
          >
            {t("conversations.filterChannelAll")}
          </Button>
          {CHANNEL_FILTERS.map((ch) => {
            const Icon = channelIcon(ch)
            return (
              <Button
                key={ch}
                variant={channel === ch ? "secondary" : "ghost"}
                size="sm"
                onClick={() => updateParams({ channel: ch })}
              >
                {Icon && <Icon className="mr-1 h-3.5 w-3.5" />}
                {t(`conversations.channel.${ch}`)}
              </Button>
            )
          })}
        </div>
        <div className="max-w-sm flex-1">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
            placeholder={t("conversations.searchPlaceholder")}
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : !data?.items.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {humanOnly
                ? t("conversations.emptyHuman")
                : t("conversations.empty")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.items.map((contact) => (
                <li key={contact.id}>
                  <Link
                    to={`/conversations/${contact.id}`}
                    className={cn(
                      "flex items-center gap-4 py-3 transition-colors hover:bg-accent/50",
                      contact.mode === "human" && "bg-destructive/5"
                    )}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        {initials(contact)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">
                          {contact.display_name ?? contact.external_id}
                        </p>
                        {contact.mode === "human" && (
                          <Badge variant="destructive" className="shrink-0 text-xs">
                            <Siren className="mr-1 h-3 w-3" />
                            {t("conversations.needsHuman")}
                          </Badge>
                        )}
                        <ChannelBadge channel={contact.channel} />
                        <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
                          {contact.wa_id ?? contact.external_id}
                        </span>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {contact.mode === "human" && contact.handoff_reason
                          ? t("conversations.handoffReason", {
                              reason: contact.handoff_reason,
                            })
                          : (contact.last_message?.text ??
                            (contact.last_message
                              ? t(`conversations.type.${contact.last_message.type}`, {
                                  defaultValue: contact.last_message.type,
                                })
                              : t("conversations.noMessages")))}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3.5 w-3.5" />
                        {t("conversations.messages", { count: contact.message_count })}
                      </span>
                      {contact.last_message && (
                        <span>
                          {new Date(
                            contact.last_message.created_at + "Z"
                          ).toLocaleDateString(i18n.language)}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {totalPages > 1 && (
            <div className="mt-4">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
