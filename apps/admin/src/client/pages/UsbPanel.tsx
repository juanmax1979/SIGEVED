import { useEffect, useState } from "react";
import type { EvidenceCategory } from "@espejo/shared";
import { EVIDENCE_CATEGORIES } from "@espejo/shared";
import { api } from "../api";

type UsbDevice = {
  serial: string;
  state: "device" | "unauthorized" | "offline" | "other";
  model: string;
  manufacturer: string;
  android: string;
  hardwareSerial: string;
  imei: string;
};

type UsbStatus = {
  adb: boolean;
  scrcpy: boolean;
  devices: UsbDevice[];
};

export function UsbPanel({ caseId, onSaved }: { caseId: string; onSaved: () => void }) {
  const [status, setStatus] = useState<UsbStatus | null>(null);
  const [serial, setSerial] = useState("");
  const [seconds, setSeconds] = useState(30);
  const [category, setCategory] = useState<EvidenceCategory>("otro");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () => {
      api<UsbStatus>("/api/usb/status")
        .then((data) => {
          if (!alive) return;
          setStatus(data);
          setSerial((current) => current || data.devices.find((item) => item.state === "device")?.serial || data.devices[0]?.serial || "");
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 4000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const selected = status?.devices.find((item) => item.serial === serial);
  const ready = selected?.state === "device" && !busy;
  const deviceName = selected ? [selected.manufacturer, selected.model].filter(Boolean).join(" ") : "";

  async function run(label: string, path: string, body: unknown) {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      setMessage(label === "Espejando" ? "Se abrió la ventana con la pantalla del teléfono." : "La captura quedó guardada en la causa, con su huella SHA-256.");
      if (label !== "Espejando") onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo usar el teléfono.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="panel" style={{ marginBottom: 18 }}>
      <h2>Captura por cable USB</h2>
      <p className="meta">
        Conectá el teléfono con el cable, activá la depuración USB y aceptá el aviso en la pantalla del aparato. Desde acá se ve esa pantalla y se guardan las capturas en la causa.
      </p>
      {!status ? <p className="meta">Buscando el cable…</p> : null}
      {status && !status.adb ? (
        <p className="error">
          Esta computadora no tiene adb. Instalá Android Platform Tools y volvé a abrir la estación. En el teléfono: Ajustes, Acerca del teléfono, tocá siete veces Número de compilación y activá Depuración USB.
        </p>
      ) : null}
      {status?.adb && status.devices.length === 0 ? (
        <p className="meta">No hay un teléfono en el cable. Conectalo y aceptá «Permitir depuración USB».</p>
      ) : null}
      {status && status.devices.length > 0 ? (
        <>
          <div className="row" style={{ marginTop: 14 }}>
            <label style={{ minWidth: 280 }}>
              Teléfono
              <select value={serial} onChange={(event) => setSerial(event.target.value)}>
                {status.devices.map((item) => (
                  <option key={item.serial} value={item.serial}>
                    {(item.model || item.serial) + (item.state === "device" ? "" : ` · ${item.state === "unauthorized" ? "falta aceptar" : item.state}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Segundos de video
              <select value={seconds} onChange={(event) => setSeconds(Number(event.target.value))}>
                <option value={15}>15</option>
                <option value={30}>30</option>
                <option value={60}>60</option>
                <option value={120}>120</option>
              </select>
            </label>
            <label>
              Categoría
              <select value={category} onChange={(event) => setCategory(event.target.value as EvidenceCategory)}>
                {EVIDENCE_CATEGORIES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {selected ? (
            <p className="meta">
              {deviceName || "Teléfono"}
              {selected.android ? ` · Android ${selected.android}` : ""}
              {selected.hardwareSerial ? ` · Serie ${selected.hardwareSerial}` : ""}
              {selected.imei ? ` · IMEI ${selected.imei}` : " · IMEI no disponible por el cable"}
            </p>
          ) : null}
          {selected?.state === "unauthorized" ? (
            <p className="error">El teléfono está conectado. Falta aceptar «Permitir depuración USB» en su pantalla.</p>
          ) : null}
          <label>
            Nota de la captura
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Qué se está mostrando" />
          </label>
          <div className="row">
            <button className="btn" disabled={!ready || !status.scrcpy} onClick={() => run("Espejando", "/api/usb/mirror", { serial })}>
              {busy === "Espejando" ? "Abriendo…" : "Espejar pantalla"}
            </button>
            <button
              className="btn"
              disabled={!ready}
              onClick={() => run("Capturando", `/api/cases/${caseId}/usb/capture`, { serial, category, note, deviceName })}
            >
              {busy === "Capturando" ? "Capturando…" : "Capturar lo que se ve"}
            </button>
            <button
              className="btn"
              disabled={!ready}
              onClick={() => run("Grabando", `/api/cases/${caseId}/usb/record`, { serial, seconds, category, note, deviceName })}
            >
              {busy === "Grabando" ? `Grabando ${seconds} s…` : "Grabar pantalla"}
            </button>
          </div>
          {status.scrcpy ? null : (
            <p className="meta">Las capturas funcionan. Para ver la pantalla en vivo hace falta instalar scrcpy.</p>
          )}
        </>
      ) : null}
      {message ? <p className="ok">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
