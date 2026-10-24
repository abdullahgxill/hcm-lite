import axios from "axios";
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 25000,
});
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("hcm-token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(
  (r) => r,
  (e) => {
    if (
      e.response?.status === 401 &&
      !["/auth/login", "/auth/password"].some((path) =>
        e.config?.url?.includes(path),
      )
    )
      window.dispatchEvent(new Event("hcm-session-expired"));
    return Promise.reject(e);
  },
);
export function errorMessage(e) {
  return (
    e.response?.data?.errors
      ?.map((x) => `${x.field || "Form"}: ${x.reason}`)
      .join(" · ") ||
    e.response?.data?.message ||
    "Unable to connect. Check the backend and try again."
  );
}
export async function download(url, filename) {
  const { data } = await api.get(url, { responseType: "blob" });
  const href = URL.createObjectURL(data),
    a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
