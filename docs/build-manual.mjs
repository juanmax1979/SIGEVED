import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  TextRun,
} from "docx";

const require = createRequire(import.meta.url);
const PDFDocument = require("pdfkit");
const outDir = path.dirname(fileURLToPath(import.meta.url));
const fecha = "9 de octubre de 2026";

const blocks = [
  { type: "cover" },
  { type: "h1", text: "1. Para qué sirve este manual" },
  { type: "p", text: "Este manual describe cómo se usa SIGVED para recibir evidencia digital en una causa. Hay dos puestos: la estación, que se abre en la computadora del equipo, y la app SIGVED, que usa la persona que aporta los archivos desde su teléfono." },
  { type: "p", text: "La estación no se administra desde otra computadora de la red. Se abre en la misma PC donde quedan guardados los archivos, en http://127.0.0.1:4780." },
  { type: "h1", text: "2. Qué hace y qué no hace" },
  { type: "p", text: "SIGVED recibe los archivos que la persona elige o que captura en el momento, y los guarda en la estación con su huella SHA-256. No lee la bandeja de mensajes, no copia bases de WhatsApp ni de otras aplicaciones, no recupera archivos borrados y no arma una imagen forense del teléfono." },
  { type: "bullet", text: "Por la app solo salen del teléfono las fotos, los videos y los documentos que la persona incorporó a SIGVED y envió durante una sesión abierta." },
  { type: "bullet", text: "Por el cable USB, la estación puede ver la pantalla, guardar una captura o grabar lo que se está mostrando. La persona tiene que aceptar la depuración USB en el teléfono." },
  { type: "bullet", text: "Nada se envía a internet. El teléfono y la computadora se hablan por la red local." },
  { type: "h1", text: "3. Antes de empezar" },
  { type: "h2", text: "3.1. Computadora" },
  { type: "bullet", text: "Windows, con Node.js instalado. La primera vez, en la carpeta del sistema, se ejecuta iniciar-estacion.bat. Ese archivo instala lo que falte, prepara la estación y la deja abierta." },
  { type: "bullet", text: "En el navegador de esa misma computadora: http://127.0.0.1:4780." },
  { type: "bullet", text: "La cuenta de Windows tiene que ser del dominio de la organización. SIGVED lee el DNI del atributo de Active Directory y con ese dato consulta SIGI." },
  { type: "bullet", text: "La conexión a la base de SIGI se configura en la estación. No se escribe en este manual." },
  { type: "h2", text: "3.2. Teléfono y red" },
  { type: "bullet", text: "SIGVED se usa desde la aplicación instalada en el teléfono. El único código que se escanea es el de la causa, dentro de SIGVED, para enviar la evidencia." },
  { type: "bullet", text: "El teléfono y la computadora tienen que verse entre sí. Si el teléfono usa el punto de acceso de la PC, la red de la sesión es la que empieza con 192.168.137." },
  { type: "bullet", text: "En Android, la captura por cable usa un cable de datos, no solo de carga, y hay que aceptar en el teléfono el aviso «Permitir la depuración por USB». En iPhone la evidencia se envía por Wi-Fi: el cable no instala SIGVED ni espeja la pantalla." },
  { type: "h2", text: "3.3. Instalar la aplicación" },
  { type: "p", text: "Antes de la diligencia, SIGVED tiene que estar instalada en el teléfono. El archivo es SIGVED-1.0.apk. Se puede instalar de dos maneras." },
  { type: "h2", text: "Por cable USB" },
  { type: "ol", items: [
    "Conectar el teléfono con un cable de datos, la pantalla desbloqueada y la depuración USB aceptada.",
    "En la computadora, instalar el archivo con el comando de ADB: adb install -r seguido de la ruta de SIGVED-1.0.apk.",
    "Si el teléfono muestra un aviso para permitir la instalación por USB, tocarlo. En Xiaomi o HyperOS hay que tener activa la opción Instalar vía USB.",
  ] },
  { type: "h2", text: "Desde el dispositivo" },
  { type: "ol", items: [
    "Copiar SIGVED-1.0.apk al almacenamiento interno del teléfono. En el administrador de archivos aparece en la raíz o en la carpeta Download, no en el acceso directo Descargas del navegador.",
    "Abrir ese archivo en el teléfono y tocar Instalar.",
    "Si el teléfono pregunta si el administrador de archivos puede instalar aplicaciones, permitirlo.",
  ] },
  { type: "p", text: "Después de instalarla, SIGVED se abre como cualquier otra aplicación. No hace falta otro programa para iniciarla." },
  { type: "h2", text: "iPhone" },
  { type: "p", text: "En un iPhone, SIGVED no se instala copiando un archivo al almacenamiento. Apple exige una compilación firmada con una cuenta de desarrollador y que ese iPhone esté registrado antes de generar el instalable. La evidencia se envía por la red local." },
  { type: "p", text: "La primera vez que el iPhone se conecta a la estación, iOS pide permiso de Red local. Hay que aceptarlo. Si se rechazó, se activa en Ajustes, SIGVED, Red local. El iPhone y la computadora tienen que estar en el mismo Wi-Fi." },
  { type: "h1", text: "4. Identificación de quien carga la prueba" },
  { type: "ol", items: [
    "Abrir la estación. SIGVED toma el usuario de Windows y el DNI desde Active Directory. No se tipea el DNI.",
    "SIGI devuelve el nombre y las dependencias habilitadas para esa persona.",
    "Si hay más de una dependencia, el selector muestra solo las habilitadas. Elegir aquella donde se va a cargar la evidencia. La lista de causas queda limitada a esa dependencia.",
  ] },
  { type: "p", text: "Al cambiar la dependencia, desaparecen las causas de las otras oficinas. Para verlas hay que volver a elegir esa dependencia en el selector." },
  { type: "note", text: "Solo se puede crear una causa si la dependencia de radicación del expediente está habilitada para ese usuario en SIGI. Si no coincide, el alta queda bloqueada." },
  { type: "h1", text: "5. Alta de la causa" },
  { type: "ol", items: [
    "En la estación, tocar Nueva causa.",
    "Escribir el número de expediente tal como figura en SIGI, con las barras. Ejemplo: 1/2021-1.",
    "Tocar Consultar expediente. La estación completa la carátula, la dependencia y el proceso.",
    "Revisar que la dependencia del expediente sea una de las habilitadas y que, si hay varias, esté elegida esa misma en el selector.",
    "Tocar Crear causa.",
  ] },
  { type: "p", text: "Si la consulta no corresponde a una dependencia habilitada, Crear causa permanece deshabilitado y la estación explica el motivo. No se guarda la causa." },
  { type: "h1", text: "6. Procedimiento por la app" },
  { type: "p", text: "Este camino sirve cuando la persona aporta fotos, videos o documentos que ya están en el teléfono, o que toma en el momento con la cámara. Los archivos quedan en el teléfono hasta que se envían." },
  { type: "h2", text: "6.1. En la estación" },
  { type: "ol", items: [
    "Abrir la causa.",
    "En Conectar un teléfono, elegir la red de esta PC por la que el teléfono llega. Si está en el punto de acceso de la computadora, elegir esa red.",
    "Tocar Abrir sesión de descarga. Aparece un código QR y un código escrito, por ejemplo ABCD-EFGH. La sesión dura dos horas.",
  ] },
  { type: "h2", text: "6.2. En el teléfono" },
  { type: "ol", items: [
    "Abrir la aplicación SIGVED ya instalada en el teléfono.",
    "Incorporar la evidencia con Tomar foto, Grabar video, Elegir de la galería o Adjuntar documento. Se puede repetir las veces que haga falta.",
    "Abrir cada archivo de la lista para asignar una categoría y, si corresponde, una nota. Las categorías son: lesiones o estado físico, lugar de los hechos, amenaza o mensaje, documento, audio u otro.",
    "Tocar Conectar con la estación.",
    "Si la persona quiere figurar con un nombre o unas iniciales, escribirlo. Puede quedar vacío.",
    "Tocar Escanear código y leer el QR de la sesión. También se puede escribir a mano la dirección de la estación y el código.",
    "Confirmar con Conectar con esta estación. La pantalla muestra la carátula y el estado Conectado.",
    "Tocar Enviar los que faltan, o esperar a que la estación pida los archivos. Cada archivo pasa a Recibido cuando la estación lo guardó.",
    "Al terminar, tocar Cortar conexión. Desde la estación también se puede cerrar la sesión. Después de cerrada no sale ningún archivo más.",
  ] },
  { type: "h2", text: "6.3. En la estación, al recibir" },
  { type: "ol", items: [
    "En la sesión, marcar los archivos que se quieren bajar y pedir la descarga. La app también puede enviarlos sin esa marca.",
    "Volver a la causa. Cada archivo muestra su huella SHA-256 y si coincide con la que calculó el teléfono.",
    "Si dice que no coincide, no se usa ese archivo como recibido íntegro. Se deja constancia y, si la persona todavía está conectada, se pide un nuevo envío.",
  ] },
  { type: "h1", text: "7. Procedimiento por cable USB" },
  { type: "p", text: "Este camino sirve para dejar constancia de lo que se ve en la pantalla del teléfono: una conversación abierta, una publicación o cualquier otra imagen que la persona muestra. No extrae el historial oculto ni los mensajes que no están en pantalla." },
  { type: "h2", text: "7.1. Preparar el teléfono" },
  { type: "ol", items: [
    "Usar un cable de datos y un puerto USB que la computadora reconozca. Si Windows dice que el dispositivo no se reconoce, cambiar el cable o el puerto antes de seguir.",
    "En el teléfono, activar las opciones de desarrollador. En la mayoría de los Android se entra a Ajustes, Acerca del teléfono, y se toca varias veces el número de compilación. En HyperOS el camino es Ajustes, Acerca del teléfono, Todas las especificaciones, y se toca siete veces Versión de HyperOS.",
    "Activar Depuración USB. En Xiaomi puede hacer falta, además, Depuración USB (ajustes de seguridad).",
    "Conectar el cable con la pantalla desbloqueada y aceptar «Permitir la depuración por USB».",
    "Si el teléfono pregunta el uso del USB, elegir transferencia de archivos.",
  ] },
  { type: "h2", text: "7.2. En la causa" },
  { type: "ol", items: [
    "En Captura por cable USB, confirmar que figura el teléfono, el fabricante, el modelo y, si el aparato lo informa, el IMEI.",
    "Espejar pantalla abre la ventana en vivo. Sirve para ubicar lo que se va a guardar. Hay que cerrar esa ventana antes de grabar: el teléfono no puede espejar y grabar al mismo tiempo.",
    "Capturar lo que se ve guarda una imagen PNG de la pantalla en la causa.",
    "Grabar pantalla graba el video durante los segundos elegidos (15, 30, 60 o 120) y lo guarda en la causa. La grabación usa un tamaño compatible con el teléfono, no la resolución completa de la pantalla, porque varios equipos rechazan esa resolución.",
    "Se puede escribir una nota de qué se está mostrando y elegir la categoría antes de capturar o grabar.",
  ] },
  { type: "note", text: "El IMEI se lee por el cable cuando el teléfono se registra en la causa, o cuando la estación completa una sesión que todavía no lo tenía. Tiene que estar conectado y con la depuración aceptada. Si solo se conecta por Wi-Fi, el IMEI puede quedar vacío." },
  { type: "h1", text: "8. Cierre: paquete, huellas e informe" },
  { type: "ol", items: [
    "En la causa, tocar Armar paquete y huella.",
    "La estación arma evidencia.zip con los archivos, el archivo manifiesto.json y el acta de recepción.",
    "Calcula la huella SHA-256 del zip completo y la muestra en pantalla.",
    "Descargar zip y Descargar informe PDF. El informe queda fuera del zip a propósito: si entrara en el paquete, la huella cambiaría.",
    "Conservar juntos el zip y el PDF. El PDF trae la carátula, el expediente, la oficina, el responsable, el IMEI cuando se pudo leer, la huella de cada archivo y la huella del zip.",
    "Dentro del zip, manifiesto.json y acta-recepcion.txt repiten la huella de cada archivo.",
  ] },
  { type: "p", text: "La huella del zip identifica el paquete entero. La huella de cada archivo identifica ese archivo. No se reemplaza una por la otra." },
  { type: "h1", text: "9. Eliminar una causa" },
  { type: "p", text: "En el listado, cada tarjeta tiene un tacho de basura. Dentro de la causa también está el botón Eliminar causa. En los dos casos aparece antes esta advertencia: «Se eliminarán todos los registros de la causa y la causa.»" },
  { type: "p", text: "Cancelar no borra nada. Confirmar elimina la causa, los archivos, las sesiones y el paquete de esa computadora. No se puede deshacer." },
  { type: "h1", text: "10. Dónde quedan los datos" },
  { type: "p", text: "No hay un motor de base de datos aparte. La estación guarda las causas, las sesiones y las huellas en archivos locales de la carpeta de datos de la estación, y los archivos de evidencia en carpetas de esa misma computadora. Quien se lleva la PC se lleva la evidencia. El informe y el zip exportados son la forma de entregar la diligencia." },
  { type: "h1", text: "11. Problemas frecuentes" },
  { type: "h2", text: "El teléfono no conecta con la estación" },
  { type: "p", text: "Revisar que SIGVED esté instalada, que el teléfono y la computadora estén en la misma red y que, al abrir la sesión, se haya elegido esa red. El código que se escanea es el de la causa, dentro de la app. La sesión no tiene que estar vencida ni cerrada. El firewall de Windows puede pedir permiso a Node la primera vez." },
  { type: "h2", text: "No deja crear la causa" },
  { type: "p", text: "La dependencia del expediente no está entre las que SIGI habilitó para la persona que inició Windows. Hay que elegir la dependencia correcta o usar una cuenta habilitada para esa oficina." },
  { type: "h2", text: "Windows no reconoce el USB" },
  { type: "p", text: "Suele ser el cable o el puerto, no un programa que falte. Probar otro cable de datos y otro puerto, con el teléfono desbloqueado." },
  { type: "h2", text: "La grabación de pantalla falla" },
  { type: "p", text: "Cerrar el espejo de pantalla y volver a grabar. Si el teléfono estaba grabando a resolución completa, la estación ya pide un tamaño que el grabador del aparato acepta." },
  { type: "h2", text: "La huella no coincide" },
  { type: "p", text: "El archivo que llegó no es idéntico al que el teléfono declaró. No se da por recibido íntegro. Se registra el hecho y, si la sesión sigue abierta, se solicita otro envío." },
  { type: "h1", text: "12. Orden recomendado de la diligencia" },
  { type: "ol", items: [
    "Abrir la estación e identificar a la persona por Active Directory y SIGI.",
    "Elegir la dependencia de carga.",
    "Consultar el expediente y crear la causa solo si la dependencia está habilitada.",
    "Recibir por la app los archivos que la persona aporta, o capturar por USB lo que se muestra en la pantalla.",
    "Verificar las huellas.",
    "Cerrar la sesión o cortar la conexión.",
    "Armar el paquete y conservar el zip junto con el informe PDF.",
  ] },
];

function docxParagraphs() {
  const children = [];
  let listIndex = 0;
  for (const block of blocks) {
    if (block.type === "cover") {
      children.push(
        new Paragraph({ spacing: { before: 0, after: 200 }, children: [new TextRun({ text: "PODER JUDICIAL DEL CHACO", bold: true, color: "1A4F8A", size: 24, font: "Calibri" })] }),
        new Paragraph({ spacing: { before: 200, after: 80 }, children: [new TextRun({ text: "SIGVED", bold: true, color: "12263A", size: 56, font: "Calibri", characterSpacing: 200 })] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "Sistema Integrado de Gestión Voluntario de Evidencia Digital", color: "66788A", size: 24, font: "Calibri" })] }),
        new Paragraph({ spacing: { before: 300, after: 80 }, children: [new TextRun({ text: "Manual de uso y procedimiento de extracción de evidencia", bold: true, color: "12263A", size: 32, font: "Calibri" })] }),
        new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "Estación de la computadora y aplicación del teléfono", italics: true, color: "66788A", size: 22, font: "Calibri" })] }),
        new Paragraph({ spacing: { before: 400, after: 80 }, children: [new TextRun({ text: fecha, color: "12263A", size: 20, font: "Calibri" })] }),
        new Paragraph({
          shading: { type: ShadingType.CLEAR, fill: "E7EEF6" },
          spacing: { before: 300, after: 400 },
          children: [new TextRun({ text: "Versión editable. El archivo PDF de esta misma carpeta es la versión de distribución de esta fecha. Cualquier cambio de procedimiento se incorpora primero en este documento y después se vuelve a emitir el PDF.", color: "12263A", size: 20, font: "Calibri" })],
        }),
      );
      continue;
    }
    if (block.type === "h1") {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 120 }, children: [new TextRun({ text: block.text, bold: true, color: "1A4F8A", font: "Calibri", size: 28 })] }));
    } else if (block.type === "h2") {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, children: [new TextRun({ text: block.text, bold: true, color: "12263A", font: "Calibri", size: 24 })] }));
    } else if (block.type === "p") {
      children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: block.text, font: "Calibri", size: 22, color: "12263A" })] }));
    } else if (block.type === "bullet") {
      children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text: block.text, font: "Calibri", size: 22, color: "12263A" })] }));
    } else if (block.type === "ol") {
      const reference = `pasos-${listIndex}`;
      listIndex += 1;
      for (const item of block.items) {
        children.push(new Paragraph({ numbering: { reference, level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text: item, font: "Calibri", size: 22, color: "12263A" })] }));
      }
    } else if (block.type === "note") {
      children.push(new Paragraph({
        shading: { type: ShadingType.CLEAR, fill: "FDECEB" },
        spacing: { before: 120, after: 160 },
        children: [
          new TextRun({ text: "Importante. ", bold: true, color: "9B3B32", font: "Calibri", size: 22 }),
          new TextRun({ text: block.text, color: "9B3B32", font: "Calibri", size: 22 }),
        ],
      }));
    }
  }
  return children;
}

function writeDocx() {
  const lists = blocks.filter((block) => block.type === "ol").length;
  const doc = new Document({
    numbering: {
      config: Array.from({ length: lists }, (_, index) => ({
        reference: `pasos-${index}`,
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
      })),
    },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 900, left: 1000, right: 1000 } } },
      headers: {
        default: new Header({
          children: [new Paragraph({ children: [new TextRun({ text: "SIGVED  ·  Poder Judicial del Chaco", color: "1A4F8A", bold: true, font: "Calibri", size: 18 })] })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: "Manual de uso  ·  ", color: "66788A", font: "Calibri", size: 16 }),
              new TextRun({ children: [PageNumber.CURRENT], color: "66788A", font: "Calibri", size: 16 }),
              new TextRun({ text: " / ", color: "66788A", font: "Calibri", size: 16 }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], color: "66788A", font: "Calibri", size: 16 }),
            ],
          })],
        }),
      },
      children: docxParagraphs(),
    }],
  });
  return Packer.toBuffer(doc).then((buffer) => {
    writeFileSync(path.join(outDir, "Manual-de-uso-SIGVED.docx"), buffer);
  });
}

function writePdf() {
  const file = path.join(outDir, "Manual-de-uso-SIGVED.pdf");
  const doc = new PDFDocument({ size: "A4", margins: { top: 64, bottom: 0, left: 52, right: 52 }, bufferPages: true, info: { Title: "SIGVED — Manual de uso", Author: "Poder Judicial del Chaco" } });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on("end", resolve));
  const left = 52;
  const width = doc.page.width - 104;
  let y = 0;

  function header(continued) {
    const height = continued ? 36 : 108;
    doc.save();
    doc.rect(0, 0, doc.page.width, height).fillColor("#1a4f8a").fill();
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(continued ? 11 : 22);
    doc.text("SIGVED", left, continued ? 12 : 28, { lineBreak: false });
    if (!continued) {
      doc.font("Helvetica").fontSize(10).text("Sistema Integrado de Gestión Voluntario de Evidencia Digital", left, 58, { lineBreak: false });
      doc.fontSize(12).text("Poder Judicial del Chaco", left, 76, { lineBreak: false });
    }
    doc.restore();
    return height + 22;
  }

  function page() {
    doc.addPage();
    return header(true);
  }

  function need(height) {
    if (y + height <= doc.page.height - 58) return;
    y = page();
  }

  function followingHeight(index) {
    const next = blocks[index + 1];
    if (!next || next.type === "h1") return 0;
    const sample = next.type === "ol" ? next.items[0] : next.text;
    doc.font("Helvetica").fontSize(10.5);
    return doc.heightOfString(sample || "", { width }) + 28;
  }

  y = header(false);
  doc.fillColor("#12263a").font("Helvetica-Bold").fontSize(18).text("Manual de uso y procedimiento de extracción de evidencia", left, y, { width });
  y = doc.y + 6;
  doc.fillColor("#66788a").font("Helvetica").fontSize(11).text("Estación de la computadora y aplicación del teléfono", left, y, { width });
  y = doc.y + 4;
  doc.fillColor("#12263a").fontSize(10).text(fecha, left, y);
  y = doc.y + 14;

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.type === "cover") continue;
    if (block.type === "h1") {
      need(36 + followingHeight(index));
      doc.fillColor("#1a4f8a").font("Helvetica-Bold").fontSize(14).text(block.text, left, y, { width });
      y = doc.y + 8;
    } else if (block.type === "h2") {
      need(28 + followingHeight(index));
      doc.fillColor("#12263a").font("Helvetica-Bold").fontSize(12).text(block.text, left, y, { width });
      y = doc.y + 6;
    } else if (block.type === "p" || block.type === "bullet" || block.type === "note") {
      const text = block.type === "bullet" ? `•  ${block.text}` : block.type === "note" ? `Importante. ${block.text}` : block.text;
      doc.font("Helvetica").fontSize(10.5);
      const height = doc.heightOfString(text, { width: width - (block.type === "note" ? 16 : 0) }) + (block.type === "note" ? 16 : 8);
      need(height);
      if (block.type === "note") {
        doc.save();
        doc.roundedRect(left, y, width, height, 6).fillColor("#fdeceb").fill();
        doc.restore();
        doc.fillColor("#9b3b32").text(text, left + 8, y + 6, { width: width - 16 });
      } else {
        doc.fillColor("#12263a").text(text, left, y, { width });
      }
      y = doc.y + 8;
    } else if (block.type === "ol") {
      block.items.forEach((item, index) => {
        const text = `${index + 1}.  ${item}`;
        doc.font("Helvetica").fontSize(10.5);
        const height = doc.heightOfString(text, { width }) + 6;
        need(height);
        doc.fillColor("#12263a").text(text, left, y, { width });
        y = doc.y + 4;
      });
      y += 6;
    }
  }

  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(index);
    const foot = doc.page.height - 32;
    doc.save();
    doc.moveTo(left, foot).lineTo(doc.page.width - 52, foot).strokeColor("#d9e3ee").lineWidth(0.6).stroke();
    doc.restore();
    doc.fillColor("#66788a").font("Helvetica").fontSize(8).text(
      `SIGVED · Poder Judicial del Chaco · Página ${index + 1} de ${range.count}`,
      left,
      foot + 8,
      { width, align: "center", lineBreak: false },
    );
  }
  doc.end();
  return done.then(() => writeFileSync(file, Buffer.concat(chunks)));
}

mkdirSync(outDir, { recursive: true });
await writeDocx();
await writePdf();
console.log(path.join(outDir, "Manual-de-uso-SIGVED.docx"));
console.log(path.join(outDir, "Manual-de-uso-SIGVED.pdf"));
