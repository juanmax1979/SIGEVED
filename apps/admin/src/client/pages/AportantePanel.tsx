import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  CARACTERES_APORTANTE,
  aportanteCompleto,
  errorAportante,
  errorFotoAportante,
  formatoDni,
  labelCaracter,
  normalizarAportante,
  type Aportante,
  type CaseRecord,
} from "@espejo/shared";
import { api, stationToken } from "../api";

export function DocumentosAportante({ cause }: { cause: CaseRecord }) {
  const aportante = normalizarAportante(cause.aportante);
  const identificado = { ...aportante, anonimo: false };
  const conDatos = !errorAportante(identificado) && !errorFotoAportante(identificado);
  const id = cause.id;
  return (
    <div className="meta">
      <p>Acta del procedimiento</p>
      <p>
        {conDatos ? <a href={`/api/cases/${id}/package/acta`}>Con datos del aportante</a> : "Con datos del aportante, cuando estén el nombre, el DNI, el carácter y la foto o el motivo de su ausencia"}
        {" · "}
        <a href={`/api/cases/${id}/package/acta?variante=anonimo`}>Con datos anonimizados</a>
      </p>
      <p>Consentimiento informado</p>
      <p>
        {conDatos ? <a href={`/api/cases/${id}/consentimiento`}>Con datos del aportante</a> : "Con datos del aportante, cuando estén el nombre, el DNI, el carácter y la foto o el motivo de su ausencia"}
        {" · "}
        <a href={`/api/cases/${id}/consentimiento?variante=anonimo`}>Con datos anonimizados</a>
      </p>
    </div>
  );
}

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
  const completo = aportanteCompleto(aportante);
  const fotoGuardada = aportante.dniFoto ? `/api/cases/${cause.id}/aportante/dni?v=${encodeURIComponent(cause.updatedAt)}` : "";
  const fotoVisible = previa || fotoGuardada;

  useEffect(() => {
    setForm(aportante);
  }, [aportante.nombre, aportante.dni, aportante.caracter, aportante.dniFoto, aportante.anonimo, aportante.sinFotoDni, aportante.motivoSinFoto]);

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
    const omiteFoto = !form.anonimo && form.sinFotoDni;
    if (omiteFoto) {
      const faltante = errorFotoAportante({ ...form, anonimo: false, dniFoto: false });
      if (faltante) {
        setError(faltante);
        return;
      }
    } else if (!form.anonimo && !archivo && !aportante.dniFoto) {
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
      body.set("anonimo", form.anonimo ? "1" : "0");
      body.set("sinFotoDni", !form.anonimo && form.sinFotoDni ? "1" : "0");
      body.set("motivoSinFoto", !form.anonimo && form.sinFotoDni ? form.motivoSinFoto : "");
      if (archivo && !form.sinFotoDni) body.set("foto", archivo, archivo.name || "dni.jpg");
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
            {aportante.anonimo ? <p className="meta">Aportante anónimo o de identidad reservada. El paquete no incluye nombre, DNI ni foto.</p> : null}
            {aportante.nombre ? (
              <>
                <p className="meta">Nombres y apellidos</p>
                <strong>{cause.aportante.nombre}</strong>
              </>
            ) : null}
            {aportante.dni ? (
              <>
                <p className="meta">DNI</p>
                <strong>{formatoDni(cause.aportante.dni)}</strong>
              </>
            ) : null}
            {aportante.caracter ? (
              <>
                <p className="meta">Carácter</p>
                <strong>{labelCaracter(cause.aportante.caracter, cause.aportante.caracterDetalle)}</strong>
              </>
            ) : null}
            {aportante.sinFotoDni && !aportante.dniFoto ? (
              <>
                <p className="meta">Sin foto del DNI</p>
                <strong>{aportante.motivoSinFoto}</strong>
              </>
            ) : null}
          </div>
          {fotoGuardada ? <img className="dni-foto" src={fotoGuardada} alt="Foto del DNI del aportante" /> : null}
        </div>
        <DocumentosAportante cause={cause} />
      </section>
    );
  }

  return (
    <form className="panel form" id="aportante" onSubmit={submit} style={{ marginBottom: 18 }}>
      <h2>Persona aportante</h2>
      <p className="meta">Estos datos y la foto del DNI quedan en el acta y en el consentimiento, salvo que marques aportante anónimo o de identidad reservada. Si no hay foto, podés continuar dejando el motivo.</p>
      <label className="check">
        <input
          type="checkbox"
          checked={form.anonimo}
          onChange={(event) => setForm({ ...form, anonimo: event.target.checked })}
        />
        <span>Aportante anónimo o de identidad reservada</span>
      </label>
      <p className="meta">El acta y el consentimiento del paquete no van a mostrar nombre, DNI ni foto si marcás aportante anónimo o de identidad reservada.</p>
      <label>
        Nombres y apellidos
        <input
          value={form.nombre}
          onChange={(event) => setForm({ ...form, nombre: event.target.value })}
          autoComplete="name"
          required={!form.anonimo}
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
            required={!form.anonimo}
          />
        </label>
        <label>
          Carácter
          <select
            value={form.caracter}
            onChange={(event) => setForm({ ...form, caracter: event.target.value as Aportante["caracter"] })}
            required={!form.anonimo}
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
      <div className="sin-foto">
        <label className="check">
          <input
            type="checkbox"
            checked={form.sinFotoDni}
            onChange={(event) => setForm({ ...form, sinFotoDni: event.target.checked, motivoSinFoto: event.target.checked ? form.motivoSinFoto : "" })}
          />
          <span>Continuar sin la foto del DNI</span>
        </label>
        {form.sinFotoDni ? (
          <label className="motivo-foto">
            Motivo por el que no se adjunta la foto del DNI
            <textarea
              value={form.motivoSinFoto}
              maxLength={400}
              rows={2}
              required={!form.anonimo}
              placeholder="Lo escribe el operador. Por ejemplo: incendio, pérdida o robo."
              onChange={(event) => setForm({ ...form, motivoSinFoto: event.target.value })}
            />
          </label>
        ) : null}
        {form.sinFotoDni ? <p className="meta">El acta y el consentimiento van a dejar constancia de este motivo en lugar de la foto.</p> : null}
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
          {pending ? (archivo && !form.sinFotoDni ? "Verificando la foto del DNI…" : "Guardando…") : "Guardar datos del aportante"}
        </button>
      </div>
      <DocumentosAportante cause={{ ...cause, aportante: form }} />
    </form>
  );
}
