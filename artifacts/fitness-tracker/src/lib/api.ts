export const ACTIVE_CLIENT_KEY = "fitness.activeClientId";

export function getActiveClientId() {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(ACTIVE_CLIENT_KEY);
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const activeClientId = getActiveClientId();
  if (activeClientId && !headers.has("x-client-id")) {
    headers.set("x-client-id", activeClientId);
  }

  return fetch(input, {
    credentials: "include",
    ...init,
    headers,
  });
}
