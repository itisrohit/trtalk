import { useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { EmojiPicker } from "frimousse"
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Brain,
  Clock,
  FileAudio,
  FileText,
  Hand,
  Image as ImageIcon,
  Mic,
  MousePointerClick,
  Plus,
  SendHorizontal,
  Siren,
  Smile,
  Square,
  Trash2,
  X,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  useContact,
  useContactMemories,
  useContactMessages,
  useSendOperatorMessage,
  useSetMode,
} from "@/hooks/useContacts"
import type { ContactDetail, MessageItem } from "@/types/api"
import { MessageMedia } from "@/components/shared/MessageMedia"
import { Badge } from "@/components/ui/badge"
import { ChannelBadge } from "@/components/shared/ChannelBadge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 50

// WhatsApp's 24h customer-service window (channel-specific advisory).
// Meta is the authority — the server never blocks; this is honest UX.
const WINDOW_MS = 24 * 60 * 60 * 1000

function whatsappWindow(contact: ContactDetail | undefined) {
  if (!contact || contact.channel !== "whatsapp") return null
  if (!contact.last_inbound_at) return { open: false, remainingMs: 0 }
  const deadline = new Date(contact.last_inbound_at + "Z").getTime() + WINDOW_MS
  const remainingMs = deadline - Date.now()
  return { open: remainingMs > 0, remainingMs: Math.max(0, remainingMs) }
}

function formatRemaining(ms: number): string {
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

const TYPE_ICONS: Record<string, typeof FileAudio> = {
  audio: FileAudio,
  image: ImageIcon,
  document: FileText,
  button: MousePointerClick,
}

function MessageBubble({ message }: { message: MessageItem }) {
  const { t, i18n } = useTranslation()
  const isInbound = message.direction === "in"
  const TypeIcon = TYPE_ICONS[message.type]

  return (
    <div className={cn("flex", isInbound ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[75%] rounded-lg px-3 py-2 text-sm",
          isInbound ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"
        )}
      >
        {TypeIcon && (
          <span className="mb-1 flex items-center gap-1 text-xs opacity-70">
            <TypeIcon className="h-3 w-3" />
            {t(`conversations.type.${message.type}`, { defaultValue: message.type })}
          </span>
        )}
        {!isInbound && typeof message.meta.sent_by_email === "string" && (
          <span className="mb-1 block text-xs font-medium opacity-80">
            {message.meta.sent_by_email}
          </span>
        )}
        <MessageMedia message={message} />
        {message.text && <p className="whitespace-pre-wrap">{message.text}</p>}
        {message.meta.delivery_status === "failed" && (
          <p className="mt-1 flex items-center gap-1 rounded bg-destructive/15 px-1.5 py-0.5 text-[11px] text-destructive">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {t("conversations.deliveryFailed", {
              reason:
                (message.meta.delivery_detail as string) ||
                (message.meta.delivery_code as string) ||
                "?",
            })}
          </p>
        )}
        <p
          className={cn(
            "mt-1 text-right text-[10px]",
            isInbound ? "text-muted-foreground" : "text-primary-foreground/70"
          )}
        >
          {new Date(message.created_at + "Z").toLocaleTimeString(i18n.language, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  )
}

// Meta's per-type media limits (decoded bytes)
const MAX_MB: Record<string, number> = { image: 5, document: 25, audio: 16 }

// WhatsApp only accepts JPEG/PNG images — anything else (webp, gif frames)
// is re-encoded to JPEG in the browser before it ever leaves the composer.
const WHATSAPP_IMAGE_MIMES = ["image/jpeg", "image/png"]

function reencodeToJpeg(dataUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) return reject(new Error("no canvas 2d context"))
      ctx.fillStyle = "#ffffff" // transparency → white, not black
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL("image/jpeg", 0.9))
    }
    img.onerror = () => reject(new Error("could not decode image"))
    img.src = dataUri
  })
}

function EmojiPanel({ onPick }: { onPick: (emoji: string) => void }) {
  const { t, i18n } = useTranslation()
  return (
    <EmojiPicker.Root
      onEmojiSelect={({ emoji }) => onPick(emoji)}
      locale={i18n.language.startsWith("es") ? "es" : "en"}
      className="flex h-80 w-full flex-col bg-background"
    >
      <EmojiPicker.Search
        className="mx-2 mt-2 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        placeholder={t("conversations.emojiSearch")}
      />
      <EmojiPicker.Viewport className="relative flex-1 outline-none">
        <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {t("common.loading")}
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {t("conversations.emojiEmpty")}
        </EmojiPicker.Empty>
        <EmojiPicker.List
          className="select-none pb-2"
          components={{
            CategoryHeader: ({ category, ...props }) => (
              <div
                className="bg-background px-3 pb-1.5 pt-3 text-xs font-medium text-muted-foreground"
                {...props}
              >
                {category.label}
              </div>
            ),
            Row: ({ children, ...props }) => (
              <div className="scroll-my-1 px-1.5" {...props}>
                {children}
              </div>
            ),
            Emoji: ({ emoji, ...props }) => (
              <button
                className="flex size-8 items-center justify-center rounded-md text-lg data-[active]:bg-accent"
                {...props}
              >
                {emoji.emoji}
              </button>
            ),
          }}
        />
      </EmojiPicker.Viewport>
    </EmojiPicker.Root>
  )
}

// The "+" menu mirrors WhatsApp's: photos and documents as separate entries
const IMAGE_ACCEPT = "image/*"
const DOC_ACCEPT = "application/pdf,.doc,.docx,.xls,.xlsx"

function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

interface Attachment {
  kind: "image" | "document" | "audio"
  dataUri: string
  mime: string
  name?: string
}

function Composer({ contact }: { contact: ContactDetail }) {
  const { t } = useTranslation()
  const [text, setText] = useState("")
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [localError, setLocalError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const sendOnStop = useRef(false)
  const discardOnStop = useRef(false)
  const emojiRef = useRef<HTMLDivElement>(null)
  const send = useSendOperatorMessage(contact.id)
  const window = whatsappWindow(contact)
  const blocked = window !== null && !window.open

  // WhatsApp-style emoji popover: closes on outside click / Escape
  useEffect(() => {
    if (!showEmoji) return
    const onDown = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmoji(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowEmoji(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [showEmoji])

  // Recording timer (the red counter in the bar)
  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [recording])

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    setText(text.slice(0, start) + emoji + text.slice(end))
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.selectionStart = el.selectionEnd = start + emoji.length
    })
  }

  const onPickFile = (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: "image" | "document"
  ) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (file.size > MAX_MB[kind] * 1024 * 1024) {
      setLocalError(t("conversations.attachTooLarge", { mb: MAX_MB[kind] }))
      return
    }
    setLocalError(null)
    const reader = new FileReader()
    reader.onload = async () => {
      let dataUri = reader.result as string
      let mime = file.type
      let name = file.name
      if (kind === "image" && !WHATSAPP_IMAGE_MIMES.includes(mime)) {
        try {
          dataUri = await reencodeToJpeg(dataUri)
          mime = "image/jpeg"
          name = name.replace(/\.[^.]+$/, "") + ".jpg"
        } catch {
          setLocalError(t("conversations.attachUnsupportedImage"))
          return
        }
      }
      setAttachment({ kind, dataUri, mime, name })
    }
    reader.readAsDataURL(file)
  }

  const reset = () => {
    setText("")
    setShowEmoji(false)
  }

  // Voice note + text goes out as TWO messages (audio first) — WhatsApp
  // audio has no caption and the operator's text must never be dropped.
  const sendAudio = (dataUri: string) => {
    const trimmed = text.trim()
    send.mutate(
      { type: "audio", text: null, media_data_uri: dataUri, filename: null },
      {
        onSuccess: () => {
          setAttachment(null)
          if (trimmed) {
            // follow-up text; if it fails it stays in the composer
            send.mutate({ type: "text", text: trimmed }, { onSuccess: reset })
          } else {
            reset()
          }
        },
      }
    )
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Prefer AAC; the gateway normalizes whatever comes out to MP3 anyway
      const mime =
        ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm"].find((m) =>
          MediaRecorder.isTypeSupported(m)
        ) ?? "audio/webm"
      const recorder = new MediaRecorder(stream, { mimeType: mime })
      const chunks: Blob[] = []
      recorder.ondataavailable = (ev) => {
        if (ev.data.size) chunks.push(ev.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        setRecording(false)
        if (discardOnStop.current) {
          discardOnStop.current = false
          return
        }
        const reader = new FileReader()
        reader.onload = () => {
          const dataUri = reader.result as string
          if (sendOnStop.current) {
            sendOnStop.current = false
            sendAudio(dataUri) // WhatsApp behavior: send right as you stop
          } else {
            setAttachment({ kind: "audio", dataUri, mime })
          }
        }
        reader.readAsDataURL(new Blob(chunks, { type: mime }))
      }
      recorderRef.current = recorder
      recorder.start()
      setElapsed(0)
      setRecording(true)
      setLocalError(null)
    } catch {
      setLocalError(t("conversations.micDenied"))
    }
  }

  const cancelRecording = () => {
    discardOnStop.current = true
    recorderRef.current?.stop()
  }
  const stopToPreview = () => recorderRef.current?.stop()
  const stopAndSend = () => {
    sendOnStop.current = true
    recorderRef.current?.stop()
  }

  const canSend = !blocked && !send.isPending
  const handleSend = () => {
    if (!canSend) return
    if (recording) {
      stopAndSend()
      return
    }
    const trimmed = text.trim()
    if (attachment) {
      if (attachment.kind === "audio") {
        sendAudio(attachment.dataUri)
        return
      }
      // Image/document carry the text as caption
      send.mutate(
        {
          type: attachment.kind,
          text: trimmed || null,
          media_data_uri: attachment.dataUri,
          filename: attachment.name ?? null,
        },
        {
          onSuccess: () => {
            setAttachment(null)
            reset()
          },
        }
      )
    } else if (trimmed) {
      send.mutate({ type: "text", text: trimmed }, { onSuccess: reset })
    }
  }

  // Gateway error codes travel in detail.code (ADR-004)
  const error = send.error as
    | { response?: { data?: { detail?: { code?: string } } } }
    | null
  const errorCode = error?.response?.data?.detail?.code
  const errorText = send.isError
    ? errorCode === "WINDOW_EXPIRED"
      ? t("conversations.windowExpired")
      : t("conversations.sendError", { code: errorCode ?? "" })
    : localError

  return (
    <div className="border-t border-border p-3">
      {window && (
        <p
          className={cn(
            "mb-2 flex items-center gap-1 text-xs",
            window.open ? "text-muted-foreground" : "text-destructive"
          )}
        >
          <Clock className="h-3 w-3" />
          {window.open
            ? t("conversations.windowClosesIn", {
                time: formatRemaining(window.remainingMs),
              })
            : t("conversations.windowExpired")}
        </p>
      )}

      {attachment && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-border p-2">
          {attachment.kind === "image" ? (
            <img
              src={attachment.dataUri}
              alt={attachment.name ?? t("conversations.mediaImageAlt")}
              className="h-12 w-12 rounded object-cover"
            />
          ) : attachment.kind === "audio" ? (
            <audio controls src={attachment.dataUri} className="h-9 w-56" />
          ) : (
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
          )}
          {attachment.name && (
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {attachment.name}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("conversations.removeAttachment")}
            onClick={() => setAttachment(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex items-end gap-1.5">
        {/* "+" attach menu, WhatsApp style */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("conversations.attach")}
              disabled={blocked || recording}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start">
            <DropdownMenuItem onSelect={() => imageInputRef.current?.click()}>
              <ImageIcon className="mr-2 h-4 w-4 text-primary" />
              {t("conversations.attachPhotos")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => docInputRef.current?.click()}>
              <FileText className="mr-2 h-4 w-4 text-primary" />
              {t("conversations.attachDocument")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={imageInputRef}
          type="file"
          hidden
          accept={IMAGE_ACCEPT}
          onChange={(e) => onPickFile(e, "image")}
        />
        <input
          ref={docInputRef}
          type="file"
          hidden
          accept={DOC_ACCEPT}
          onChange={(e) => onPickFile(e, "document")}
        />

        {/* Emoji popover anchored to its button, WhatsApp style */}
        <div className="relative" ref={emojiRef}>
          <Button
            variant={showEmoji ? "secondary" : "ghost"}
            size="sm"
            aria-label={t("conversations.emoji")}
            disabled={blocked || recording}
            onClick={() => setShowEmoji(!showEmoji)}
          >
            <Smile className="h-5 w-5" />
          </Button>
          {showEmoji && (
            <div className="absolute bottom-full left-0 z-50 mb-2 w-[360px] overflow-hidden rounded-lg border border-border bg-background shadow-xl">
              <EmojiPanel onPick={insertEmoji} />
            </div>
          )}
        </div>

        {recording ? (
          /* Recording bar: trash to cancel · red counter · stop for preview */
          <div className="flex min-h-[42px] flex-1 items-center gap-3 rounded-md border border-input px-3">
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("conversations.cancelRecording")}
              onClick={cancelRecording}
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
            <span className="flex items-center gap-2 text-sm tabular-nums text-destructive">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
              {formatElapsed(elapsed)}
            </span>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("conversations.stopRecording")}
              onClick={stopToPreview}
            >
              <Square className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ) : (
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={
              blocked
                ? t("conversations.composerBlocked")
                : t("conversations.composerPlaceholder")
            }
            disabled={blocked || send.isPending}
            rows={1}
            className="min-h-[42px] resize-none"
          />
        )}

        {/* WhatsApp behavior: mic when empty, send when there's something */}
        {recording || text.trim() || attachment ? (
          <Button
            size="sm"
            className="h-[42px] w-[42px] shrink-0 rounded-full p-0"
            aria-label={t("conversations.send")}
            onClick={handleSend}
            disabled={!canSend}
          >
            <SendHorizontal className="h-5 w-5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-[42px] w-[42px] shrink-0 rounded-full p-0"
            aria-label={t("conversations.record")}
            onClick={startRecording}
            disabled={blocked || send.isPending}
          >
            <Mic className="h-5 w-5" />
          </Button>
        )}
      </div>
      {errorText && <p className="mt-2 text-xs text-destructive">{errorText}</p>}
    </div>
  )
}

export function ConversationDetailPage() {
  const { t, i18n } = useTranslation()
  const { contactId = "" } = useParams()
  const [limit, setLimit] = useState(PAGE_SIZE)

  // The open conversation polls so the operator chat feels live (ADR-004)
  const { data: contact } = useContact(contactId, { poll: true })
  const { data: messages, isLoading } = useContactMessages(
    contactId,
    { limit },
    { poll: true }
  )
  const { data: memories } = useContactMemories(contactId)
  const setMode = useSetMode(contactId)
  const isHuman = contact?.mode === "human"

  // API returns newest-first; the chat renders oldest-first
  const timeline = [...(messages?.items ?? [])].reverse()
  const hasOlder = (messages?.total ?? 0) > (messages?.items.length ?? 0)

  // Pin the scroll to the newest message on first load (and contact switch).
  // While pinned near the bottom, FOLLOW new messages (own sends + polled
  // inbound); "load older" grows upward without yanking the view down.
  const scrollRef = useRef<HTMLDivElement>(null)
  const newestId = messages?.items[0]?.id
  const pinnedFor = useRef<string | null>(null)
  const atBottom = useRef(true)
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  useEffect(() => {
    const el = scrollRef.current
    if (!el || newestId === undefined) return
    if (pinnedFor.current !== contactId) {
      pinnedFor.current = contactId
      atBottom.current = true
      el.scrollTop = el.scrollHeight
      return
    }
    if (atBottom.current) el.scrollTop = el.scrollHeight
  }, [newestId, contactId])

  // Media loads AFTER the message renders (presigned URL fetch + lazy <img>),
  // growing the content under an already-positioned scroll — re-anchor on any
  // content growth while pinned, or the view stays cut off mid-image. The
  // container is observed too: the composer growing (attachment preview,
  // emoji panel) SHRINKS it, which also unseats the bottom.
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    const content = contentRef.current
    if (!el || !content) return
    const observer = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(content)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/conversations">
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t("conversations.back")}
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">
              {contact?.display_name ?? contact?.external_id ?? "…"}
            </h1>
            {contact?.channel && <ChannelBadge channel={contact.channel} />}
            {isHuman && (
              <Badge variant="destructive">
                <Siren className="mr-1 h-3 w-3" />
                {t("conversations.needsHuman")}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {contact?.external_id}
            {contact?.wa_id ? ` · ${contact.wa_id}` : ""}
          </p>
          {isHuman && contact?.handoff_reason && (
            <p className="mt-1 text-sm text-destructive">
              {t("conversations.handoffReason", { reason: contact.handoff_reason })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {contact && (
            <Button
              variant={isHuman ? "secondary" : "default"}
              size="sm"
              disabled={setMode.isPending}
              onClick={() => setMode.mutate(isHuman ? "agent" : "human")}
            >
              {isHuman ? (
                <Bot className="mr-1 h-4 w-4" />
              ) : (
                <Hand className="mr-1 h-4 w-4" />
              )}
              {isHuman ? t("conversations.resumeBot") : t("conversations.takeOver")}
            </Button>
          )}
          {messages && (
            <Badge variant="outline">
              {t("conversations.messages", { count: messages.total })}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="flex h-[calc(100vh-15rem)] min-h-[320px] flex-col overflow-hidden">
          <CardContent
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto pt-6"
          >
            <div ref={contentRef}>
              {isLoading ? (
                <p className="text-muted-foreground">{t("common.loading")}</p>
              ) : timeline.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("conversations.noMessages")}
                </p>
              ) : (
                <div className="space-y-3">
                  {hasOlder && (
                    <div className="text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLimit(limit + PAGE_SIZE)}
                      >
                        {t("conversations.loadOlder")}
                      </Button>
                    </div>
                  )}
                  {timeline.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}
                </div>
              )}
            </div>
          </CardContent>
          {isHuman && contact && <Composer contact={contact} />}
        </Card>

        <Card className="max-h-[calc(100vh-15rem)] overflow-y-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Brain className="h-4 w-4" />
              {t("conversations.memories")}
            </CardTitle>
            <CardDescription>{contact?.display_name}</CardDescription>
          </CardHeader>
          <CardContent>
            {!memories?.length ? (
              <p className="text-sm text-muted-foreground">
                {t("conversations.noMemories")}
              </p>
            ) : (
              <ul className="space-y-2">
                {memories.map((memory) => (
                  <li
                    key={memory.id}
                    className="rounded-md border border-border p-2 text-sm"
                  >
                    {memory.content}
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {new Date(memory.created_at + "Z").toLocaleDateString(
                        i18n.language
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
