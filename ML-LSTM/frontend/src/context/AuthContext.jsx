import React, { createContext, useContext, useEffect, useState } from "react";
import { apiClient } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("aml_user")); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("aml_token");
    if (!token) {
      localStorage.removeItem("aml_user");
      setUser(null);
      setLoading(false);
      return;
    }

    apiClient.get("/auth/me")
      .then(({ data }) => {
        localStorage.setItem("aml_user", JSON.stringify(data));
        setUser(data);
      })
      .catch(() => {
        localStorage.removeItem("aml_token");
        localStorage.removeItem("aml_user");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await apiClient.post("/auth/login", { email, password });
    localStorage.setItem("aml_token", data.access_token);
    localStorage.setItem("aml_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("aml_token");
    localStorage.removeItem("aml_user");
    setUser(null);
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, setLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
