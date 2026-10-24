import { useEffect, useState, useCallback } from "react";
import { api, errorMessage } from "../services/api";
export function useResource(url) {
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    if (!url) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    api
      .get(url)
      .then((r) => {
        if (active) setData(r.data);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [url, version]);
  return { data, loading, error, reload, setData };
}
