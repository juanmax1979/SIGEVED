import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  CARACTERES_APORTANTE,
  errorAportante,
  formatoDni,
  labelCaracter,
  normalizarAportante,
  type Aportante,
  type CaseRecord,
} from "@espejo/shared";
import { api, stationToken } from "../api";

export function AportantePanel({
  cause,
  editing,
  onEditing,
  onSaved,
}: {
  cause: CaseRecord;
  editing: boolean;
  onEditing: (value: boolean) => void;
  onSaved: (cause: CaseRecord) => void;
}) {
  const aportante = normalizarAportante(cause.aportante);
  const [form, setForm] = useState<Aportante>(aportante);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState("");
  const [esperando, setEsperando] = useState(false);
  const [aviso, setAviso] = useState("");
  const archivoRef = useRef<HTMLInputElement>(null);
  const previaRef = useRef("");
  const esperaRef = useRef(0);
  previaRef.current = previa;
  const completo = !errorAportante(aportante) && aportante.dniFoto;
  const fotoGuardada = aportante.dniFoto ? `/api/cases/${cause.id}/aportante/dni?v=${encodeURIComponent(cause.updatedAt)}` : "";
  const fotoVisible = previa || fotoGuardada;

  useEffect(() => {
    setForm(aportante);
  }, [aportante.nombre, aportante.dni, aportante.caracter, aportante.dniFoto]);

  useEffect(() => {
    return () => {
      esperaRef.current += 1;
      if (previaRef.current.startsWith("blob:")) URL.revokeObjectURL(previaRef.current);
    };
  }, []);

  function elegir(file: File) {
    setArchivo(file);
    setPrevia((actual) => {
      if (actual.startsWith("blob:")) URL.revokeObjectURL(actual);
      return URL.createObjectURL(file);
    });
    setError("");
  }

  function cancelarEspera() {
    esperaRef.current += 1;
    setEsperando(false);
    setAviso("");
  }

  async function sacarFoto() {
    const marca = esperaRef.current + 1;
    esperaRef.current = marca;
    setError("");
    setAviso("");
    setEsperando(true);
    try {
      const abierta = await api<{ serial: string; paths: string[] }>("/api/usb/camera", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (esperaRef.current !== marca) return;
      setAviso("Se abrió la cámara del teléfono. Encuadrá el DNI, sacá la foto y confirmala en el teléfono.");
      const limite = Date.now() + 90000;
      while (esperaRef.current === marca && Date.now() < limite) {
        const headers = new Headers();
        const token = stationToken();
        if (token) headers.set("X-Espejo-Admin", token);
        headers.set("Content-Type", "application/json");
        const response = await fetch("/api/usb/camera/foto", {
          method: "POST",
          headers,
          body: JSON.stringify({ serial: abierta.serial, paths: abierta.paths }),
        });
        if (esperaRef.current !== marca) return;
        if (response.status === 204) {
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
          continue;
        }
        if (!response.ok) {
          let message = "No se pudo traer la foto del teléfono.";
          try {
            const body = (await response.json()) as { error?: string };
            if (body.error) message = body.error;
          } catch {
            // la respuesta no trae detalle
          }
          throw new Error(message);
        }
        const blob = await response.blob();
        const tipo = blob.type || "image/jpeg";
        const extension = tipo.includes("png") ? "png" : "jpg";
        elegir(new File([blob], `dni.${extension}`, { type: tipo }));
        setEsperando(false);
        setAviso("");
        return;
      }
      if (esperaRef.current === marca) {
        setError("No llegó una foto nueva desde el teléfono. Sacala con la cámara o usá Subir foto.");
        setEsperando(false);
        setAviso("");
      }
    } catch (reason) {
      if (esperaRef.current !== marca) return;
      setEsperando(false);
      setAviso("");
      setError(reason instanceof Error ? reason.message : "No se pudo usar la cámara del teléfono.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = errorAportante(form);
    if (message) {
      setError(message);
      return;
    }
    if (!archivo && !aportante.dniFoto) {
      setError("Sacá o subí una foto del DNI del aportante.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const body = new FormData();
      body.set("nombre", form.nombre);
      body.set("dni", form.dni);
      body.set("caracter", form.caracter);
      if (archivo) body.set("foto", archivo, archivo.name || "dni.jpg");
      const data = await api<{ case: CaseRecord }>(`/api/cases/${cause.id}/aportante`, {
        method: "PUT",
        body,
      });
      setArchivo(null);
      setPrevia("");
      onSaved(data.case);
      onEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudieron guardar los datos del aportante.");
    } finally {
      setPending(false);
    }
  }

  if (!editing && completo) {
    return (
      <section className="panel" id="aportante" style={{ marginBottom: 18 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Persona aportante</h2>
          <button className="btn-ghost" type="button" onClick={() => onEditing(true)}>
            Ver o editar
          </button>
        </div>
        <div className="aportante-resumen">
          <div>
            <p className="meta">Nombres y apellidos</p>
            <strong>{cause.aportante.nombre}</strong>
            <p className="meta">DNI</p>
            <strong>{formatoDni(cause.aportante.dni)}</strong>
            <p className="meta">Carácter</p>
            <strong>{labelCaracter(cause.aportante.caracter, cause.aportante.caracterDetalle)}</strong>
          </div>
          <img className="dni-foto" src={fotoGuardada} alt="Foto del DNI del aportante" />
        </div>
        <p className="meta">
          <a href={`/api/cases/${cause.id}/consentimiento`}>Descargar consentimiento (Word)</a>
          {" · "}
          Se puede editar antes de imprimir y firmar.
        </p>
      </section>
    );
  }

  return (
    <form className="panel form" id="aportante" onSubmit={submit} style={{ marginBottom: 18 }}>
      <h2>Persona aportante</h2>
      <p className="meta">Estos datos y la foto del DNI quedan en el acta judicial que se genera al armar el paquete.</p>
      <label>
        Nombres y apellidos
        <input
          value={form.nombre}
          onChange={(event) => setForm({ ...form, nombre: event.target.value })}
          autoComplete="name"
          required
        />
      </label>
      <div className="two">
        <label>
          DNI
          <input
            value={form.dni}
            inputMode="numeric"
            maxLength={8}
            onChange={(event) => setForm({ ...form, dni: event.target.value.replace(/\D/g, "").slice(0, 8) })}
            required
          />
        </label>
        <label>
          Carácter
          <select
            value={form.caracter}
            onChange={(event) => setForm({ ...form, caracter: event.target.value as Aportante["caracter"] })}
            required
          >
            <option value="">Elegí el carácter</option>
            {CARACTERES_APORTANTE.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <p className="meta">Foto del DNI. Tiene que verse el documento, no otra imagen.</p>
        {fotoVisible ? <img className="dni-foto" src={fotoVisible} alt="Foto del DNI del aportante" /> : null}
        <div className="row">
          <button className="btn-ghost" type="button" disabled={esperando || pending} onClick={() => void sacarFoto()}>
            {esperando ? "Esperando la foto del teléfono…" : "Sacar foto"}
          </button>
          <button className="btn-ghost" type="button" disabled={pending} onClick={() => archivoRef.current?.click()}>
            Subir foto
          </button>
          {esperando ? (
            <button className="btn-ghost" type="button" onClick={cancelarEspera}>
              Cancelar
            </button>
          ) : null}
          <input
            ref={archivoRef}
            type="file"
            accept="image/jpeg,image/png"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) elegir(file);
            }}
          />
        </div>
        {aviso ? <p className="meta">{aviso}</p> : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="row">
        {completo ? (
          <button
            className="btn-ghost"
            type="button"
            onClick={() => {
              setForm(aportante);
              setArchivo(null);
              setPrevia("");
              setError("");
              cancelarEspera();
              onEditing(false);
            }}
          >
            Cancelar
          </button>
        ) : null}
        <button className="btn" disabled={pending}>
          {pending ? (archivo ? "Verificando la foto del DNI…" : "Guardando…") : "Guardar datos del aportante"}
        </button>
      </div>
    </form>
  );
}
