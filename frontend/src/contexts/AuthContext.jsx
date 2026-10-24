import { createContext, useContext, useEffect, useState } from "react";
import { api, errorMessage } from "../services/api";
const Auth = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const save = (data) => {
    sessionStorage.setItem("hcm-token", data.token);
    setUser(data.user);
  };
  const clear = () => {
    sessionStorage.removeItem("hcm-token");
    setUser(null);
  };
  useEffect(() => {
    if (sessionStorage.getItem("hcm-token"))
      api
        .get("/auth/me")
        .then((r) => setUser(r.data))
        .catch((e) => {
          clear();
          setError(errorMessage(e));
        })
        .finally(() => setLoading(false));
    else setLoading(false);
    window.addEventListener("hcm-session-expired", clear);
    return () => window.removeEventListener("hcm-session-expired", clear);
  }, []);
  return (
    <Auth.Provider
      value={{
        user,
        loading,
        error,
        save,
        logout: async () => {
          try {
            await api.post("/auth/logout");
          } finally {
            clear();
          }
        },
        refresh: async () => setUser((await api.get("/auth/me")).data),
      }}
    >
      {children}
    </Auth.Provider>
  );
}
export const useAuth = () => useContext(Auth);
