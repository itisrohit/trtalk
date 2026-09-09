import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type { FaqEntry, FaqEntryPayload, FaqSearchHit } from "@/types/api"

const BASE = "/admin/modules/faq"

export function useFaqEntries() {
  return useQuery({
    queryKey: ["faq", "entries"],
    queryFn: async () => {
      const { data } = await apiClient.get<FaqEntry[]>(`${BASE}/entries`)
      return data
    },
  })
}

export function useCreateFaqEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: FaqEntryPayload) => {
      const { data } = await apiClient.post<FaqEntry>(`${BASE}/entries`, payload)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["faq", "entries"] }),
  })
}

export function useUpdateFaqEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: FaqEntryPayload & { id: string }) => {
      const { data } = await apiClient.put<FaqEntry>(`${BASE}/entries/${id}`, payload)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["faq", "entries"] }),
  })
}

export function useDeleteFaqEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`${BASE}/entries/${id}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["faq", "entries"] }),
  })
}

export function useReembedAll() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ reembedded: number }>(`${BASE}/reembed`)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["faq", "entries"] }),
  })
}

export function useFaqSearchPreview(query: string) {
  return useQuery({
    queryKey: ["faq", "search", query],
    queryFn: async () => {
      const { data } = await apiClient.get<FaqSearchHit[]>(`${BASE}/search`, {
        params: { q: query },
      })
      return data
    },
    enabled: query.trim().length > 0,
  })
}
