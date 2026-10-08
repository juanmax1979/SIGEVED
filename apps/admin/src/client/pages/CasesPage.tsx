import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { mismaDependencia, type CaseRecord } from "@espejo/shared";
import { api } from "../api";
import { SigiBar, type SigiSession } from "./SigiBar";

type ListedCase = CaseRecord & { evidenceCount: number };

export function CasesPage() {
  const [cases, setCases] = useState<ListedCase[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [sigi, setSigi] = useState<SigiSession | null>(null);

  async function load() {
    const data = await api<{ cases: ListedCase[] }>("/api/cases");
    setCases(data.cases);
  }

  useEffect(() => {
    load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudieron leer las causas."));
  }, []);

  return (
    <>
      <div className="top">
        <div>
          <div className="kicker">Causas</div>
          <h1>Recepción de evidencia</h1>
          <p className="lede">
            Cada causa abre una sesión con código. El teléfono se conecta a esta estación y recién ahí se pueden descargar los archivos elegidos.
          </p>
        </div>
        <button className="btn" onClick={() => setOpen((value) => !value)}>
          {open ? "Cerrar" : "Nueva causa"}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <SigiBar onChange={setSigi} />
      {open ? (
        <NewCase
          sigi={sigi}
          onCreated={async () => {
            setOpen(false);
            await load();
          }}
        />
      ) : null}
      {cases.length === 0 ? (
        <section className="panel">
          <h2>Todavía no hay causas</h2>
          <p className="meta">Creá la causa antes de pedirle a la persona aportante que abra EVIDIA en su teléfono.</p>
        </section>
      ) : (
        <div className="grid cards">
          {cases.map((cause) => (
            <Link key={cause.id} to={`/causas/${cause.id}`} className="card">
              {cause.proceso ? <div className="kicker">{cause.proceso}</div> : null}
              <h2>{cause.caratula}</h2>
              <p className="meta">
                {cause.expediente || "Sin expediente"} · {cause.evidenceCount === 1 ? "1 archivo" : `${cause.evidenceCount} archivos`}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function NewCase({ sigi, onCreated }: { sigi: SigiSession | null; onCreated: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [looking, setLooking] = useState(false);
  const [radicacion, setRadicacion] = useState("");
  const [form, setForm] = useState({
    caratula: "",
    expediente: "",
    dependencia: "",
    oficina: "",
    proceso: "",
    responsable: "",
    notas: "",
  });

  async function consult() {
    setLooking(true);
    setError("");
    try {
      const data = await api<{
        expediente: { expediente: string; caratula: string; dependencia: string; radicacion: string; proceso: string };
      }>(`/api/sigi/expediente?numero=${encodeURIComponent(form.expediente.trim())}`);
      const found = data.expediente;
      setForm((current) => ({
        ...current,
        expediente: found.expediente || current.expediente,
        caratula: found.caratula,
        dependencia: found.dependencia,
        proceso: found.proceso,
        oficina: sigi?.oficinaNombre ?? "",
        responsable: sigi?.nombre ?? "",
      }));
      setRadicacion(found.radicacion);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo consultar el expediente.");
    } finally {
      setLooking(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await api("/api/cases", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          tipo: "otro",
          oficina: sigi?.oficinaNombre || form.oficina,
          responsable: sigi?.nombre || form.responsable,
        }),
      });
      await onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo crear la causa.");
    } finally {
      setPending(false);
    }
  }

  const habilitacion = useMemo(() => {
    if (!form.dependencia) return "";
    const oficinas = sigi?.dependencias ?? [];
    if (oficinas.length === 0) {
      return "Ingresá con tu DNI de SIGI. Solo se crean causas en una dependencia habilitada.";
    }
    const match = oficinas.find((item) => mismaDependencia(item.nombre, form.dependencia));
    if (!match) {
      return "No podés cargar evidencia en esta causa. La dependencia del expediente no está habilitada para tu usuario en SIGI.";
    }
    if (sigi?.oficinaId !== match.id) {
      return `Este expediente corresponde a ${[match.nombre, match.rol].filter(Boolean).join(" · ")}. Elegí esa dependencia para cargar la evidencia.`;
    }
    return "";
  }, [form.dependencia, sigi]);

  return (
    <form className="panel form" onSubmit={submit} style={{ marginBottom: 18 }}>
      <h2>Nueva causa</h2>
      <label>
        Expediente
        <input value={form.expediente} onChange={(event) => setForm({ ...form, expediente: event.target.value })} required />
      </label>
      <div className="row">
        <button className="btn" type="button" onClick={() => void consult()} disabled={looking || !form.expediente.trim()}>
          {looking ? "Consultando SIGI…" : "Consultar expediente"}
        </button>
      </div>
      <label>
        Carátula
        <input value={form.caratula} readOnly />
      </label>
      <label>
        Dependencia
        <input value={form.dependencia} readOnly />
      </label>
      <label>
        Responsable de la recepción
        <input value={sigi?.nombre || form.responsable} readOnly />
      </label>
      {form.proceso ? <p className="meta">Proceso: {form.proceso}</p> : null}
      {radicacion && radicacion !== form.dependencia ? <p className="meta">Radicación: {radicacion}</p> : null}
      {sigi?.oficinaNombre ? <p className="meta">La evidencia se carga en {sigi.oficinaNombre}.</p> : null}
      <label>
        Notas
        <textarea value={form.notas} onChange={(event) => setForm({ ...form, notas: event.target.value })} />
      </label>
      {error ? <p className="error">{error}</p> : null}
      {habilitacion ? <p className="error">{habilitacion}</p> : null}
      <div className="row">
        <button className="btn" disabled={pending || !form.caratula || !form.dependencia || Boolean(habilitacion)}>
          {pending ? "Guardando…" : "Crear causa"}
        </button>
      </div>
    </form>
  );
}
