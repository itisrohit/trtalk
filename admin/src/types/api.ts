// --- Auth ---
export interface AdminLoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface AdminUser {
  id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

// --- Agent config (singleton) ---
export interface AgentConfig {
  id: string
  system_prompt: string
  bot_paused: boolean
  enabled_tools: Record<string, boolean>
  tool_config: Record<string, Record<string, unknown>>
  updated_at: string
}

export interface AgentConfigUpdate {
  system_prompt?: string
  bot_paused?: boolean
  enabled_tools?: Record<string, boolean>
  tool_config?: Record<string, Record<string, unknown>>
}

// --- Tool registry (/admin/tools) ---
export interface ToolInfo {
  name: string
  description: string
  enabled: boolean
}

// Flat JSON Schema (module config convention: str/int/float/bool fields only)
export interface ConfigSchemaProperty {
  type?: string
  title?: string
  description?: string
  default?: unknown
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
}

export interface ConfigSchema {
  title?: string
  description?: string
  properties: Record<string, ConfigSchemaProperty>
  required?: string[]
}

export interface ModuleInfo {
  name: string
  tools: ToolInfo[]
  config_key: string
  config_schema: ConfigSchema | null
  config: Record<string, unknown> | null
}

export interface ToolRegistryResponse {
  modules: ModuleInfo[]
}

// --- FAQ module (/admin/modules/faq) ---
export interface FaqEntry {
  id: string
  question: string
  answer: string
  tags: string[]
  has_embedding: boolean
  created_at: string
  updated_at: string
}

export interface FaqEntryPayload {
  question: string
  answer: string
  tags: string[]
}

export interface FaqSearchHit {
  entry: FaqEntry
  similarity: number
}

// --- Conversation inspection (/admin/contacts) ---
export interface LastMessagePreview {
  direction: "in" | "out"
  type: string
  text: string | null
  created_at: string
}

export type ConversationMode = "agent" | "human"

export interface ContactListItem {
  id: string
  channel: string
  external_id: string
  wa_id: string | null
  display_name: string | null
  created_at: string
  updated_at: string
  message_count: number
  last_message: LastMessagePreview | null
  // Inbox fields (ADR-004)
  mode: ConversationMode
  handoff_reason: string | null
  handoff_at: string | null
  // Anchor for WhatsApp's 24h customer-service window (computed client-side)
  last_inbound_at: string | null
}

export interface ContactDetail {
  id: string
  channel: string
  external_id: string
  wa_id: string | null
  display_name: string | null
  meta: Record<string, unknown>
  created_at: string
  updated_at: string
  mode: ConversationMode
  handoff_reason: string | null
  handoff_at: string | null
  last_inbound_at: string | null
}

export interface ModeResponse {
  mode: ConversationMode
}

export interface MessageItem {
  id: string
  direction: "in" | "out"
  type: string
  text: string | null
  meta: Record<string, unknown>
  created_at: string
  // true = GET /admin/media/{id} returns a presigned URL (ADR-003)
  has_media: boolean
}

export interface MediaUrlResponse {
  url: string
  expires_in: number
}

export interface MemoryItem {
  id: string
  content: string
  has_embedding: boolean
  created_at: string
}

// --- Leads (handoff module, /admin/modules/handoff/leads) ---
export interface Lead {
  id: string
  contact_id: string
  contact_display_name: string | null
  name: string
  interest: string | null
  email: string | null
  phone: string | null
  notes: string | null
  extra: Record<string, string>
  created_at: string
}

// --- Pagination ({items, total} envelope, limit/offset params) ---
export interface Paginated<T> {
  items: T[]
  total: number
}

export interface PaginationParams {
  limit?: number
  offset?: number
  search?: string
}
