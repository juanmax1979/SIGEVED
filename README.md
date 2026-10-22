# SIGEVED

Estación local y aplicación móvil para recibir evidencia digital en una investigación. La persona aportante elige en su teléfono fotos, videos y documentos. La estación, abierta en la computadora del equipo, descarga esos archivos por la red local.

Espejo no lee mensajes, no revisa el teléfono en segundo plano y no envía archivos a internet. Cada archivo se guarda primero en el teléfono. Sale de ahí solo durante una sesión confirmada, hacia la computadora de la estación.

## Qué guarda la estación

- El archivo tal como fue elegido.
- La huella SHA-256 calculada en el teléfono y recalculada al recibirlo.
- Fecha de captura, fecha de recepción, categoría, nota, dispositivo y el nombre con el que la persona quiso figurar.

Desde la causa se puede exportar un paquete con los archivos, un manifiesto y un acta de recepción.

## Requisitos

- Node.js 22 o superior.
- La computadora y el teléfono en el mismo Wi-Fi, sin aislamiento de clientes.
- En el teléfono, la app Expo Go o un build de desarrollo.

## Estación en la computadora

La primera vez:

```bash
npm install
npm run build
```

Para usarla:

```bash
npm run admin:start
```

En Windows también se puede ejecutar `iniciar-estacion.bat`.

Abrí [http://127.0.0.1:4780](http://127.0.0.1:4780) en esa misma computadora. La estación no se administra desde otro equipo de la red: las causas y los archivos solo se ven desde ahí. El teléfono únicamente puede conectarse a una sesión vigente.

Durante el desarrollo de la interfaz:

```bash
npm run admin
```

Eso abre la API en el puerto 4780 y la interfaz en [http://127.0.0.1:5173](http://127.0.0.1:5173).

Los archivos quedan en `apps/admin/data/`.

## App móvil

```bash
npm run mobile
```

Escaneá el código de Expo con Expo Go. En Android hace falta permitir tráfico HTTP en la red local; la configuración del proyecto ya lo declara para un build propio.

## Uso

1. En la estación, creá la causa y abrí una sesión de descarga.
2. En el teléfono, agregá la evidencia: foto, video, galería o documento.
3. Escaneá el QR o escribí la dirección y el código.
4. Confirmá la conexión.
5. En la estación, elegí los archivos y descargalos. La persona también puede tocar "Enviar los que faltan".
6. Exportá el paquete de la causa cuando termine la recepción.

La sesión dura dos horas. Cerrarla corta la descarga.

## Límites

La estación y el teléfono tienen que verse entre sí por la red local. Si el Wi-Fi aísla los dispositivos, la conexión no va a establecerse. En Windows, el firewall puede pedir permiso para Node la primera vez.
