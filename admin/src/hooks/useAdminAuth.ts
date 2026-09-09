import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { apiClient } from "@/lib/api-client"
import type { AdminLoginResponse, AdminUser } from "@/types/api"

export function useAdminAuth() {
  return useQuery({
    queryKey: ["admin", "me"],
    queryFn: async () => {
      const { data } = await apiClient.get<AdminUser>("/admin/auth/me")
      return data
    },
    retry: false,
  })
}

export function useAdminLogin() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const formData = new URLSearchParams()
      formData.append("username", credentials.email)
      formData.append("password", credentials.password)

      const { data } = await apiClient.post<AdminLoginResponse>(
        "/admin/auth/login",
        formData,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      )
      return data
    },
    onSuccess: (data) => {
      localStorage.setItem("admin_access_token", data.access_token)
      localStorage.setItem("admin_refresh_token", data.refresh_token)
      queryClient.invalidateQueries({ queryKey: ["admin", "me"] })
      navigate("/")
    },
  })
}

export function useAdminLogout() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return () => {
    localStorage.removeItem("admin_access_token")
    localStorage.removeItem("admin_refresh_token")
    queryClient.clear()
    navigate("/login")
  }
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem("admin_access_token")
}
