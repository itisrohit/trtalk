import axios from "axios"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8090"

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
})

// Request interceptor - add auth token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("admin_access_token")
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor - handle 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      const refreshToken = localStorage.getItem("admin_refresh_token")
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_BASE_URL}/admin/auth/refresh`, {
            refresh_token: refreshToken,
          })

          localStorage.setItem("admin_access_token", data.access_token)
          localStorage.setItem("admin_refresh_token", data.refresh_token)

          originalRequest.headers.Authorization = `Bearer ${data.access_token}`
          return apiClient(originalRequest)
        } catch {
          // Refresh failed, clear tokens and redirect to login
          localStorage.removeItem("admin_access_token")
          localStorage.removeItem("admin_refresh_token")
          window.location.href = "/login"
        }
      } else {
        window.location.href = "/login"
      }
    }

    return Promise.reject(error)
  }
)
