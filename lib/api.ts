import axios from "axios";

/**
 * Dynamic API Base URL resolver.
 * Reads the active store's apiUrl from localStorage.
 * Falls back to NEXT_PUBLIC_API_URL env variable or localhost.
 */
const getApiBaseUrl = (): string => {
  let url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

  if (typeof window !== "undefined") {
    try {
      const storesJson = localStorage.getItem("driver_saved_stores");
      const activeId = localStorage.getItem("driver_active_store");

      if (storesJson && activeId) {
        const stores = JSON.parse(storesJson);
        const active = stores.find((s: any) => s.branchId === activeId);
        if (active?.apiUrl) url = active.apiUrl;
      }
    } catch (e) {
    }

    // Always upgrade remote http:// URLs to https:// to prevent (blocked:mixed-content)
    if (url.startsWith("http://")) {
      const isLocalhost = url.includes("localhost") || url.includes("127.0.0.1");
      if (!isLocalhost) {
        url = url.replace("http://", "https://");
      }
    }
  }
  return url;
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Request Interceptor: Dynamic baseURL + JWT Token injection ──
api.interceptors.request.use((config) => {
  // Re-evaluate baseURL on every request (handles store switching)
  config.baseURL = getApiBaseUrl();

  // Attach driver JWT token if available
  if (typeof window !== "undefined") {
    try {
      const session = localStorage.getItem("driver_session");
      if (session) {
        const parsed = JSON.parse(session);
        if (parsed?.token) {
          config.headers.Authorization = `Bearer ${parsed.token}`;
        }
      }
    } catch (e) {
    }
  }

  return config;
});

// ── Response Interceptor: Auto-logout on 401 ──
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (
      typeof window !== "undefined" &&
      err.response?.status === 401 &&
      err.response?.data?.code !== "CHECK_IN_REQUIRED"
    ) {
      // Don't auto-logout for CHECK_IN_REQUIRED 
      localStorage.removeItem("driver_session");
      window.location.href = "/";
    }
    return Promise.reject(err);
  }
);

export { getApiBaseUrl };
export default api;
