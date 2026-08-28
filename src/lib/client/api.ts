/**
 * Browser-side fetch helper.
 *
 * Every state-changing request carries the CSRF token from the readable
 * cookie. Centralising it here means no component can forget it, and a 403
 * from a stale token surfaces as a readable message rather than a silent
 * failure.
 */
const CSRF_COOKIE = "dmi_csrf";
const CSRF_HEADER = "x-dmi-csrf";

export function readCsrfToken(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        [CSRF_HEADER]: readCsrfToken(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : "Network error" };
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (!res.ok) {
    const err = (data as { error?: string } | null)?.error;
    const retry = res.headers.get("retry-after");
    return {
      ok: false,
      status: res.status,
      data: data as T,
      error:
        err ??
        (res.status === 429
          ? `Too many requests. Try again in ${retry ?? "a moment"}${retry ? " seconds" : ""}.`
          : `Request failed (HTTP ${res.status}).`),
    };
  }
  return { ok: true, status: res.status, data: data as T, error: null };
}

export const apiPost = <T,>(url: string, body: unknown) => request<T>("POST", url, body);
export const apiPatch = <T,>(url: string, body: unknown) => request<T>("PATCH", url, body);
export const apiGet = <T,>(url: string) => request<T>("GET", url);
