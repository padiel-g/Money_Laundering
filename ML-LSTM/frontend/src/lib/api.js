import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:8001";
export const API = `${BASE}/api`;

export const apiClient = axios.create({ baseURL: API });

apiClient.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("aml_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

apiClient.interceptors.response.use(
  (r) => r,
  (e) => {
    if (e.response?.status === 401) {
      localStorage.removeItem("aml_token");
      localStorage.removeItem("aml_user");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(e);
  }
);
