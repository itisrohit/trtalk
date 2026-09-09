import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { createApi, type ChatMessage, type WidgetApi } from './api'
import { renderMarkup } from './markup'
import { getVisitorId } from './visitor'

/** Clear `waiting` after this long even if no reply ever arrives. */
const WAITING_TIMEOUT_MS = 45_000

// ---------------------------------------------------------------------------
// Inline SVG icons (no emojis; currentColor unless a fill is passed).
// ---------------------------------------------------------------------------

function ChatIcon({ size = 26, fill = 'currentColor' }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 19 18" fill={fill} aria-hidden="true">
      <path d="M3.5 1.5H15.5C16.325 1.5 17 2.175 17 3V12C17 12.825 16.325 13.5 15.5 13.5H5L2 16.5L2.0075 3C2.0075 2.175 2.675 1.5 3.5 1.5ZM5.75 8.25H7.25V6.75H5.75V8.25ZM10.25 8.25H8.75V6.75H10.25V8.25ZM11.75 8.25H13.25V6.75H11.75V8.25Z" />
    </svg>
  )
}

function SendIcon({ size = 18, fill = 'currentColor' }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden="true">
      <path d="M 3.6166082,2.6025929 21.288002,11.054146 c 0.522381,0.249792 0.743212,0.87569 0.49342,1.398071 -0.103224,0.215938 -0.277384,0.390097 -0.49342,0.493321 L 3.6166082,21.39717 C 3.0942959,21.646961 2.4683879,21.426033 2.2185863,20.90375 2.1100399,20.676756 2.0867338,20.418354 2.152934,20.175607 L 3.9204286,13.69462 c 0.044284,-0.162418 0.1813412,-0.282569 0.3481039,-0.305268 l 8.5631425,-1.163151 c 0.07377,-0.01047 0.134924,-0.059 0.163201,-0.125239 l 0.01468,-0.05264 c 0.01399,-0.09823 -0.04246,-0.190304 -0.131109,-0.22494 l -0.04677,-0.01223 -8.5531136,-1.163151 c -0.1667451,-0.0227 -0.3037833,-0.142849 -0.348057,-0.30517 L 2.152934,3.8241364 C 2.0005933,3.2655734 2.3299115,2.6892715 2.8884745,2.5369406 c 0.2427275,-0.0662 0.5011588,-0.042894 0.7281337,0.065652 z" />
    </svg>
  )
}

function MicIcon({ size = 24, fill = 'currentColor' }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden="true">
      <path d="M14.99 11.5C14.99 13.16 13.66 14.5 12 14.5C10.34 14.5 9 13.16 9 11.5V5.5C9 3.84 10.34 2.5 12 2.5C13.66 2.5 15 3.84 15 5.5L14.99 11.5ZM17.2505 12.21C17.3105 11.8 17.6605 11.5 18.0805 11.5C18.6005 11.5 19.0005 11.96 18.9305 12.47C18.4705 15.44 15.9605 17.79 13.0005 18.22V20.5C13.0005 21.05 12.5505 21.5 12.0005 21.5C11.4505 21.5 11.0005 21.05 11.0005 20.5V18.22C8.03047 17.77 5.53047 15.44 5.07047 12.47C5.00047 11.96 5.40047 11.5 5.92047 11.5C6.33047 11.5 6.69047 11.8 6.75047 12.21C7.12047 14.83 9.47047 16.6 12.0005 16.6C14.5305 16.6 16.8805 14.82 17.2505 12.21Z" />
    </svg>
  )
}

function ImageIcon({ size = 24, fill = 'currentColor' }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden="true">
      <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V5H19V19ZM8.5 11C9.33 11 10 10.33 10 9.5C10 8.67 9.33 8 8.5 8C7.67 8 7 8.67 7 9.5C7 10.33 7.67 11 8.5 11ZM12 14L9.5 11.5L6 16.5H18L14 11L12 14Z" />
    </svg>
  )
}

function StopIcon({ size = 24, fill = 'currentColor' }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

function CloseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileToDataUri(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('read failed'))
    r.readAsDataURL(file)
  })
}

/** A single message bubble, media-aware. */
function Bubble({ m }: { m: ChatMessage }) {
  const cls = `msg ${m.role}`
  if (m.type === 'image') {
    if (m.src) {
      return (
        <div class={`${cls} has-img`}>
          <img class="thumb" src={m.src} alt="Sent image" />
          {m.text ? <div class="caption">{renderMarkup(m.text)}</div> : null}
        </div>
      )
    }
    if (m.text) {
      return (
        <div class={cls}>
          <div class="media-note-row">
            <ImageIcon size={16} />
            <span>Image</span>
          </div>
          <div class="caption">{renderMarkup(m.text)}</div>
        </div>
      )
    }
    return (
      <div class={`${cls} media-note`}>
        <ImageIcon size={16} />
        <span>Image</span>
      </div>
    )
  }
  if (m.type === 'audio') {
    return (
      <div class={`${cls} media-note`}>
        <MicIcon size={16} />
        <span>Voice note</span>
      </div>
    )
  }
  return <div class={cls}>{m.text ? renderMarkup(m.text) : m.hasMedia ? 'Media' : ''}</div>
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export interface AppProps {
  gateway: string
  /** Injectable for tests; defaults to a real client over `gateway`. */
  api?: WidgetApi
}

export function App({ gateway, api: injected }: AppProps) {
  const api = useMemo(() => injected ?? createApi(gateway), [gateway, injected])
  const visitor = useMemo(() => getVisitorId(), [])

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [pendingImage, setPendingImage] = useState<{ mime: string; dataUri: string } | null>(null)
  const [recording, setRecording] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [status, setStatus] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // waiting: from clicking send until the agent replies (SSE or inline ack),
  // with a safety timeout so the composer never stays locked forever.
  function startWaiting() {
    if (waitTimerRef.current) clearTimeout(waitTimerRef.current)
    waitTimerRef.current = setTimeout(() => {
      waitTimerRef.current = null
      setWaiting(false)
    }, WAITING_TIMEOUT_MS)
    setWaiting(true)
  }
  function stopWaiting() {
    if (waitTimerRef.current) {
      clearTimeout(waitTimerRef.current)
      waitTimerRef.current = null
    }
    setWaiting(false)
  }

  // Rehydrate history + open the live stream on mount (ADR-011 §3).
  useEffect(() => {
    let closed = false
    api.history(visitor).then((h) => {
      if (!closed) setMessages(h)
    })
    const close = api.openStream(visitor, (m) => {
      setMessages((prev) => [...prev, m])
      stopWaiting()
    })
    return () => {
      closed = true
      close()
      if (waitTimerRef.current) clearTimeout(waitTimerRef.current)
    }
  }, [api, visitor])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [messages, waiting, open])

  function handleReplies(replies: ChatMessage[]) {
    if (replies.length) {
      setMessages((m) => [...m, ...replies])
      stopWaiting()
    }
  }

  /** Stage a picked image in the composer — nothing is sent until Send. */
  async function stageImage(file: File) {
    if (waiting) return
    const dataUri = await fileToDataUri(file)
    setPendingImage({ mime: file.type, dataUri })
  }

  /** Send the composer: staged image (+ optional caption) or plain text. */
  async function sendComposed() {
    if (waiting) return
    const text = input.trim()
    if (pendingImage) {
      const media = pendingImage
      setInput('')
      setPendingImage(null)
      setMessages((m) => [...m, { role: 'in', type: 'image', text: text || null, src: media.dataUri }])
      startWaiting()
      handleReplies(await api.send(visitor, { type: 'image', ...(text ? { text } : {}), media }))
      return
    }
    if (!text) return
    setInput('')
    setMessages((m) => [...m, { role: 'in', type: 'text', text }])
    startWaiting()
    handleReplies(await api.send(visitor, { type: 'text', text }))
  }

  async function toggleRecord() {
    if (recording) {
      recorderRef.current?.stop()
      return
    }
    if (waiting) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setStatus('Voice is not supported in this browser')
      return
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mr = new MediaRecorder(stream)
    const chunks: Blob[] = []
    mr.ondataavailable = (e) => chunks.push(e.data)
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      setRecording(false)
      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' })
      setMessages((m) => [...m, { role: 'in', type: 'audio', text: null }])
      startWaiting()
      const dataUri = await fileToDataUri(blob)
      handleReplies(await api.send(visitor, { type: 'audio', media: { mime: blob.type, dataUri } }))
    }
    recorderRef.current = mr
    mr.start()
    setRecording(true)
    setStatus('')
  }

  const locked = waiting

  return (
    <div class="root">
      <div class={`panel${open ? ' open' : ''}`}>
        <div class="header">
          <span class="title">TrTalk</span>
          <button class="close" aria-label="Close chat" onClick={() => setOpen(false)}>
            <CloseIcon />
          </button>
        </div>
        <div class="log" ref={logRef}>
          {messages.map((m, i) => (
            <Bubble key={i} m={m} />
          ))}
          {waiting ? (
            <div class="msg out typing" aria-label="Agent is typing">
              <span class="dot" />
              <span class="dot" />
              <span class="dot" />
            </div>
          ) : null}
        </div>
        {status ? <div class="status">{status}</div> : null}
        {pendingImage ? (
          <div class="preview">
            <img class="preview-thumb" src={pendingImage.dataUri} alt="Staged image" />
            <button
              class="preview-remove"
              aria-label="Remove staged image"
              disabled={locked}
              onClick={() => setPendingImage(null)}
            >
              <CloseIcon size={10} />
            </button>
          </div>
        ) : null}
        <div class="composer">
          <label class={`icon-btn attach${locked ? ' disabled' : ''}`} aria-label="Attach image">
            <ImageIcon />
            <input
              type="file"
              accept="image/*"
              disabled={locked}
              style="display:none"
              onChange={(e) => {
                const el = e.currentTarget as HTMLInputElement
                const f = el.files?.[0]
                el.value = ''
                if (f) void stageImage(f)
              }}
            />
          </label>
          <button
            class={`icon-btn${recording ? ' rec' : ''}`}
            aria-label={recording ? 'Stop recording' : 'Record voice note'}
            disabled={locked && !recording}
            onClick={() => void toggleRecord()}
          >
            {recording ? <StopIcon /> : <MicIcon />}
          </button>
          <input
            class="text"
            type="text"
            placeholder="Type a message…"
            value={input}
            disabled={locked}
            onInput={(e) => setInput((e.currentTarget as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void sendComposed()
            }}
          />
          <button class="send" aria-label="Send message" disabled={locked} onClick={() => void sendComposed()}>
            <SendIcon />
          </button>
        </div>
      </div>
      <button class="bubble" aria-label={open ? 'Close chat' : 'Open chat'} onClick={() => setOpen((o) => !o)}>
        <ChatIcon fill="#FFFFFF" />
      </button>
    </div>
  )
}
