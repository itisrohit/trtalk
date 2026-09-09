import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type { MediaUrlResponse } from "@/types/api"

// Presigned URLs expire server-side (~300s): staleTime stays below the
// expiry so a remount refetches a fresh URL instead of reusing a dead one.
const PRESIGN_STALE_MS = 4 * 60 * 1000

export function useMediaUrl(messageId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["media", messageId],
    queryFn: async () => {
      const { data } = await apiClient.get<MediaUrlResponse>(
        `/admin/media/${messageId}`
      )
      return data
    },
    enabled,
    staleTime: PRESIGN_STALE_MS,
    gcTime: PRESIGN_STALE_MS,
    retry: 1,
  })
}
