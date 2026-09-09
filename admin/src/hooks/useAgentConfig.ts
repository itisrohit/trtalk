import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type { AgentConfig, AgentConfigUpdate, ToolRegistryResponse } from "@/types/api"

export function useAgentConfig() {
  return useQuery({
    queryKey: ["agent-config"],
    queryFn: async () => {
      const { data } = await apiClient.get<AgentConfig>("/admin/config")
      return data
    },
  })
}

export function useUpdateAgentConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: AgentConfigUpdate) => {
      const { data } = await apiClient.put<AgentConfig>("/admin/config", payload)
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["agent-config"], data)
      // The Tools page derives enable/config state from the registry listing
      queryClient.invalidateQueries({ queryKey: ["tools"] })
    },
  })
}

export function useToolRegistry() {
  return useQuery({
    queryKey: ["tools"],
    queryFn: async () => {
      const { data } = await apiClient.get<ToolRegistryResponse>("/admin/tools")
      return data
    },
  })
}
