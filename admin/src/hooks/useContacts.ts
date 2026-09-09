import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type {
  ContactDetail,
  ContactListItem,
  ConversationMode,
  MemoryItem,
  MessageItem,
  ModeResponse,
  Paginated,
  PaginationParams,
} from "@/types/api"

// The open conversation polls (~5s) so operator chat feels live — omakase,
// no websockets (ADR-004).
export const INBOX_POLL_MS = 5000

export function useContacts(
  params: PaginationParams & { mode?: ConversationMode; channel?: string },
  options?: { poll?: boolean }
) {
  return useQuery({
    queryKey: ["contacts", params],
    queryFn: async () => {
      const { data } = await apiClient.get<Paginated<ContactListItem>>(
        "/admin/contacts",
        { params }
      )
      return data
    },
    placeholderData: keepPreviousData,
    refetchInterval: options?.poll ? INBOX_POLL_MS : undefined,
  })
}

export function useContact(contactId: string, options?: { poll?: boolean }) {
  return useQuery({
    queryKey: ["contacts", contactId],
    queryFn: async () => {
      const { data } = await apiClient.get<ContactDetail>(
        `/admin/contacts/${contactId}`
      )
      return data
    },
    refetchInterval: options?.poll ? INBOX_POLL_MS : undefined,
  })
}

export function useContactMessages(
  contactId: string,
  params: PaginationParams,
  options?: { poll?: boolean }
) {
  return useQuery({
    queryKey: ["contacts", contactId, "messages", params],
    queryFn: async () => {
      const { data } = await apiClient.get<Paginated<MessageItem>>(
        `/admin/contacts/${contactId}/messages`,
        { params }
      )
      return data
    },
    placeholderData: keepPreviousData,
    refetchInterval: options?.poll ? INBOX_POLL_MS : undefined,
  })
}

export function useContactMemories(contactId: string) {
  return useQuery({
    queryKey: ["contacts", contactId, "memories"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ items: MemoryItem[] }>(
        `/admin/contacts/${contactId}/memories`
      )
      return data.items
    },
  })
}

// --- Inbox writes (Sprint 7, ADR-004) ---

export function useSetMode(contactId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (mode: ConversationMode) => {
      const { data } = await apiClient.put<ModeResponse>(
        `/admin/contacts/${contactId}/mode`,
        { mode }
      )
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts"] }),
  })
}

export interface OperatorMessagePayload {
  type?: "text" | "image" | "document" | "audio"
  text?: string | null
  // base64 data: URI — the mirror of the inbound contract (ADR-004)
  media_data_uri?: string | null
  filename?: string | null
}

export function useSendOperatorMessage(contactId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: OperatorMessagePayload) => {
      const { data } = await apiClient.post<MessageItem>(
        `/admin/contacts/${contactId}/messages`,
        payload
      )
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["contacts", contactId] }),
  })
}
