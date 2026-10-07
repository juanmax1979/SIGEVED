import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CASE_TYPES, labelCaseType, type CaseRecord, type CaseType } from "@espejo/shared";
import { api } from "../api";

type ListedCase = CaseRecord & { evidenceCount: number };

export function CasesPage() {
  const [cases, setCases] = useState<ListedCase[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

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
      {open ? (
        <NewCase
          onCreated={async () => {
            setOpen(false);
            await load();
          }}
        />
      ) : null}
      {cases.length === 0 ? (
        <section className="panel">
          <h2>Todavía no hay causas</h2>
          <p className="meta">Creá la causa antes de pedirle a la persona aportante que abra Espejo en su teléfono.</p>
        </section>
      ) : (
        <div className="grid cards">
          {cases.map((cause) => (
            <Link key={cause.id} to={`/causas/${cause.id}`} className="card">
              <div className="kicker">{labelCaseType(cause.tipo)}</div>
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

function NewCase({ onCreated }: { onCreated: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    caratula: "",
    expediente: "",
    tipo: "violencia_domestica" as CaseType,
    dependencia: "",
    responsable: "",
    notas: "",
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await api("/api/cases", { method: "POST", body: JSON.stringify(form) });
      await onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo crear la causa.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="panel form" onSubmit={submit} style={{ marginBottom: 18 }}>
      <h2>Nueva causa</h2>
      <label>
        Carátula
        <input value={form.caratula} onChange={(event) => setForm({ ...form, caratula: event.target.value })} required minLength={3} />
      </label>
      <div className="two">
        <label>
          Expediente
          <input value={form.expediente} onChange={(event) => setForm({ ...form, expediente: event.target.value })} />
        </label>
        <label>
          Tipo
          <select value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value as CaseType })}>
            {CASE_TYPES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="two">
        <label>
          Dependencia
          <input value={form.dependencia} onChange={(event) => setForm({ ...form, dependencia: event.target.value })} />
        </label>
        <label>
          Responsable de la recepción
          <input value={form.responsable} onChange={(event) => setForm({ ...form, responsable: event.target.value })} />
        </label>
      </div>
      <label>
        Notas
        <textarea value={form.notas} onChange={(event) => setForm({ ...form, notas: event.target.value })} />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <div className="row">
        <button className="btn" disabled={pending}>
          {pending ? "Guardando…" : "Crear causa"}
        </button>
      </div>
    </form>
  );
}
