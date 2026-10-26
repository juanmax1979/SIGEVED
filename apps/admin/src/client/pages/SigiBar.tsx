import { useEffect, useState } from "react";
import { api } from "../api";

export type SigiSession = {
  configured: boolean;
  needsDni: boolean;
  username: string;
  dni: string;
  origen: "" | "directorio";
  nombre: string;
  sistema: "" | "sigi" | "iure";
  dependencias: { id: string; nombre: string; circunscripcion: string; rol: string; sistema?: "sigi" | "iure"; fueroId?: string }[];
  oficinaId: string;
  oficinaNombre: string;
  error: string;
};

function etiqueta(item: SigiSession["dependencias"][number]): string {
  const partes = [item.nombre, item.rol, item.circunscripcion].filter(Boolean);
  if (item.sistema === "iure") partes.push("IURE");
  return partes.join(" · ");
}

function clave(item: { id: string; sistema?: "sigi" | "iure" }): string {
  return `${item.sistema ?? "sigi"}:${item.id}`;
}

export function SigiBar({ onChange }: { onChange: (session: SigiSession) => void }) {
  const [session, setSession] = useState<SigiSession | null>(null);
  const [error, setError] = useState("");

  function apply(data: SigiSession) {
    setSession(data);
    onChange(data);
  }

  useEffect(() => {
    api<SigiSession>("/api/sigi/me")
      .then(apply)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "No se pudo consultar SIGI.");
      });
    // La consulta a SIGI se hace una vez al abrir la estación.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function choose(valor: string) {
    const [marca = "sigi", id = ""] = valor.split(":");
    if (!id || (marca !== "sigi" && marca !== "iure")) return;
    const sistema: "sigi" | "iure" = marca;
    setError("");
    try {
      await api("/api/sigi/oficina", { method: "POST", body: JSON.stringify({ id, sistema }) });
      setSession((current) => {
        if (!current) return current;
        const office = current.dependencias.find((item) => item.id === id && (item.sistema ?? "sigi") === sistema);
        const next = {
          ...current,
          sistema,
          oficinaId: id,
          oficinaNombre: office ? etiqueta(office) : "",
        };
        onChange(next);
        return next;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo elegir la dependencia.");
    }
  }

  if (!session && !error) return <p className="meta">Consultando la cuenta de Active Directory en SIGI e IURE…</p>;

  const identidad = session?.origen === "directorio"
    ? `Sesión de Active Directory ${session.username}. El DNI ${session.dni} se tomó de la cuenta.`
    : session?.dni
      ? `DNI ${session.dni}.`
      : `Usuario ${session?.username ?? ""}.`;

  return (
    <section className="panel" style={{ marginBottom: 18 }}>
      <h2>{session?.nombre || "Usuario de SIGI"}</h2>
      {session?.nombre ? <p className="meta">{identidad} La evidencia se carga en la dependencia de SIGI o IURE que elijas.</p> : null}
      {session && session.dependencias.length > 1 ? (
        <label>
          Dependencia donde se carga la evidencia
          <select value={clave({ id: session.oficinaId, sistema: session.sistema || "sigi" })} onChange={(event) => void choose(event.target.value)}>
            {session.dependencias.map((item) => (
              <option key={clave(item)} value={clave(item)}>
                {etiqueta(item)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {session && session.dependencias.length === 1 ? <p className="meta">Carga en {session.oficinaNombre}.</p> : null}
      {session?.error ? <p className="error">{session.error}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
