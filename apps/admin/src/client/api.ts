export type Bootstrap = {
  adminToken: string;
  port: number;
  hostname: string;
  hosts: { address: string; name: string; preferred: boolean }[];
};

let adminToken = sessionStorage.getItem("espejo-admin") ?? "";

export function stationToken(): string {
  return adminToken;
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || "La estación no pudo completar la operación.";
  } catch {
    return "La estación no pudo completar la operación.";
  }
}

export async function bootstrap(): Promise<Bootstrap> {
  const response = await fetch("/api/bootstrap");
  if (!response.ok) throw new Error(await parseError(response));
  const data = (await response.json()) as Bootstrap;
  adminToken = data.adminToken;
  sessionStorage.setItem("espejo-admin", adminToken);
  return data;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (adminToken) headers.set("X-Espejo-Admin", adminToken);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) throw new Error(await parseError(response));
  if (response.status === 204) return undefined as T;
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return undefined as T;
  return (await response.json()) as T;
}
