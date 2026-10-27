import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { causaDeOficina, identificadorProvisorioValido, mismaDependencia, type CaseRecord } from "@espejo/shared";
import { api } from "../api";
import { SigiBar, type SigiSession } from "./SigiBar";

type CargaEvidencia = { cargada: boolean; sistema: "" | "sigi" | "iure"; detalle: string };

type ListedCase = CaseRecord & { evidenceCount: number; carga?: CargaEvidencia };

export function CasesPage() {
  const [cases, setCases] = useState<ListedCase[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [sigi, setSigi] = useState<SigiSession | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ListedCase | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const data = await api<{ cases: ListedCase[] }>("/api/cases");
    setCases(data.cases);
  }

  async function remove() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError("");
    try {
      await api(`/api/cases/${pendingDelete.id}`, { method: "DELETE" });
      setPendingDelete(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo eliminar la causa.");
    } finally {
      setDeleting(false);
    }
  }

  const oficinaNombre = sigi?.oficinaNombre ?? "";
  const visibles = useMemo(
    () => (oficinaNombre ? cases.filter((cause) => causaDeOficina(cause, oficinaNombre)) : []),
    [cases, oficinaNombre],
  );

  useEffect(() => {
    if (!oficinaNombre) {
      setCases([]);
      return;
    }
    load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudieron leer las causas."));
  }, [oficinaNombre]);

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
      {pendingDelete ? (
        <section className="panel" style={{ marginBottom: 18 }}>
          <h2>Eliminar causa</h2>
          <p className="error">Se eliminarán todos los registros de la causa y la causa.</p>
          <p className="meta">{pendingDelete.caratula}</p>
          <div className="row">
            <button className="btn-ghost" type="button" onClick={() => setPendingDelete(null)} disabled={deleting}>
              Cancelar
            </button>
            <button className="btn-danger" type="button" onClick={() => void remove()} disabled={deleting}>
              {deleting ? "Eliminando…" : "Eliminar causa"}
            </button>
          </div>
        </section>
      ) : null}
      {!oficinaNombre ? (
        <section className="panel">
          <h2>Elegí una dependencia</h2>
          <p className="meta">Las causas se muestran según la dependencia seleccionada.</p>
        </section>
      ) : visibles.length === 0 ? (
        <section className="panel">
          <h2>No hay causas en esta dependencia</h2>
          <p className="meta">En {oficinaNombre.split("·")[0]?.trim()} todavía no hay causas cargadas.</p>
        </section>
      ) : (
        <div className="grid cards">
          {visibles.map((cause) => (
            <article key={cause.id} className="card case-card">
              <button
                className="card-trash"
                type="button"
                aria-label={`Eliminar ${cause.caratula}`}
                title={
                  cause.provisorio
                    ? "Un registro provisorio no se puede eliminar hasta que tenga número de expediente definitivo y la evidencia esté cargada en SIGI o IURE."
                    : cause.carga?.detalle || "Se habilita cuando la evidencia esté cargada en SIGI o IURE."
                }
                disabled={Boolean(cause.provisorio) || !cause.carga?.cargada}
                onClick={() => setPendingDelete(cause)}
              >
                <TrashIcon />
              </button>
              <Link to={`/causas/${cause.id}`} className="card-link">
                {cause.provisorio ? <div className="kicker">Registro provisorio</div> : cause.proceso ? <div className="kicker">{cause.proceso}</div> : null}
                <h2>{cause.caratula}</h2>
                <p className="meta">
                  {cause.provisorio
                    ? `Provisorio · ${cause.identificador || cause.caratula}`
                    : cause.expediente || "Sin expediente"}
                  {" · "}
                  {cause.evidenceCount === 1 ? "1 archivo" : `${cause.evidenceCount} archivos`}
                </p>
              </Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6.5 7l.8 12.2A1.5 1.5 0 0 0 8.8 20.5h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function NewCase({ sigi, onCreated }: { sigi: SigiSession | null; onCreated: () => Promise<void> }) {
  const navigate = useNavigate();
  const [modo, setModo] = useState<"" | "definitivo" | "provisorio">("");
  const [identificador, setIdentificador] = useState("");
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

  async function submitProvisorio(event: FormEvent) {
    event.preventDefault();
    if (!identificadorProvisorioValido(identificador)) {
      setError("Escribí una identificación provisoria con letras o números.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const created = await api<{ case: CaseRecord }>("/api/cases", {
        method: "POST",
        body: JSON.stringify({ provisorio: true, identificador: identificador.trim(), tipo: "otro" }),
      });
      await onCreated();
      navigate(`/causas/${created.case.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo crear la causa.");
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const created = await api<{ case: CaseRecord }>("/api/cases", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          tipo: "otro",
          oficina: sigi?.oficinaNombre || form.oficina,
          responsable: sigi?.nombre || form.responsable,
        }),
      });
      await onCreated();
      navigate(`/causas/${created.case.id}`);
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

  if (!modo) {
    return (
      <section className="panel" style={{ marginBottom: 18 }}>
        <h2>Nueva causa</h2>
        <p className="meta">Elegí si la causa ya tiene número de expediente o si vas a identificarla de manera provisoria.</p>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" type="button" onClick={() => setModo("definitivo")}>
            Registro Definitivo
          </button>
          <button className="btn" type="button" onClick={() => setModo("provisorio")}>
            Registro Provisorio
          </button>
        </div>
      </section>
    );
  }

  if (modo === "provisorio") {
    return (
      <form className="panel form" onSubmit={submitProvisorio} style={{ marginBottom: 18 }}>
        <h2>Registro provisorio</h2>
        <p className="meta">
          Usalo cuando todavía no hay número de expediente. Más adelante se puede completar con la consulta a SIGI.
        </p>
        <label>
          Identificación provisoria
          <input
            value={identificador}
            onChange={(event) => setIdentificador(event.target.value)}
            placeholder="PEDRO PASCAL S/ DENUNCIA"
            required
          />
        </label>
        {identificador.trim() && !identificadorProvisorioValido(identificador) ? (
          <p className="error">Usá letras o números. También podés usar espacios, la barra y el guion.</p>
        ) : null}
        {sigi?.oficinaNombre ? <p className="meta">La evidencia se carga en {sigi.oficinaNombre}.</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <div className="row">
          <button className="btn-ghost" type="button" onClick={() => { setModo(""); setError(""); }}>
            Volver
          </button>
          <button className="btn" disabled={pending || !identificadorProvisorioValido(identificador)}>
            {pending ? "Guardando…" : "Crear causa"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="panel form" onSubmit={submit} style={{ marginBottom: 18 }}>
      <h2>Registro definitivo</h2>
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
        <button className="btn-ghost" type="button" onClick={() => { setModo(""); setError(""); }}>
          Volver
        </button>
        <button className="btn" disabled={pending || !form.caratula || !form.dependencia || Boolean(habilitacion)}>
          {pending ? "Guardando…" : "Crear causa"}
        </button>
      </div>
    </form>
  );
}
