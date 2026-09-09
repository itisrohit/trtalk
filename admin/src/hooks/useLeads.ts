import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type { Lead, Paginated, PaginationParams } from "@/types/api"

// Module-owned endpoint (like /admin/modules/faq) — see core handoff module
const BASE = "/admin/modules/handoff"

export function useLeads(params: PaginationParams & { contact_id?: string }) {
  return useQuery({
    queryKey: ["leads", params],
    queryFn: async () => {
      const { data } = await apiClient.get<Paginated<Lead>>(`${BASE}/leads`, {
        params,
      })
      return data
    },
    placeholderData: keepPreviousData,
  })
}
