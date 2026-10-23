using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Windows.Forms;

namespace Evidia
{
    static class Program
    {
        static Process proceso;
        static StreamWriter bitacora;
        static bool propio;
        static readonly object candado = new object();

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string raiz = AppDomain.CurrentDomain.BaseDirectory;
            string node = Path.Combine(raiz, "runtime", "node.exe");
            string servidor = Path.Combine(raiz, "app", "server.mjs");
            string datos = CarpetaDatos(raiz);
            Directory.CreateDirectory(datos);

            if (!File.Exists(node) || !File.Exists(servidor))
            {
                MessageBox.Show(
                    "La instalación está incompleta. Falta el runtime o el servidor.",
                    "SIGEVED",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return;
            }

            if (!PuertoAbierto())
            {
                Iniciar(node, servidor, datos);
                propio = true;
            }

            for (int i = 0; i < 50 && !PuertoAbierto(); i++)
            {
                if (proceso != null && proceso.HasExited) break;
                System.Threading.Thread.Sleep(200);
            }

            if (!PuertoAbierto())
            {
                MessageBox.Show(
                    "La estación no arrancó. El detalle quedó en " + Path.Combine(datos, "estacion.log"),
                    "SIGEVED",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                Detener();
                return;
            }

            if (!InterfazLista())
            {
                if (propio)
                {
                    MessageBox.Show(
                        "La estación arrancó, pero no encuentra la interfaz. Reinstalá SIGEVED.",
                        "SIGEVED",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                    Detener();
                }
                else
                {
                    MessageBox.Show(
                        "El puerto 4780 ya lo está usando otro programa. Por eso el navegador abre el servidor y muestra \"Cannot GET /\". Cerrá el servidor de desarrollo y volvé a abrir SIGEVED.",
                        "SIGEVED",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning);
                }
                return;
            }

            AbrirNavegador();
            Application.Run(new Ventana());
            Detener();
        }

        static string CarpetaDatos(string raiz)
        {
            if (EstaDentro(raiz, Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles))
                || EstaDentro(raiz, Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86)))
            {
                return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "SIGEVED");
            }
            return Path.Combine(raiz, "datos");
        }

        static bool EstaDentro(string ruta, string baseDir)
        {
            if (string.IsNullOrEmpty(baseDir)) return false;
            string full = Path.GetFullPath(ruta).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            string root = Path.GetFullPath(baseDir).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            return full.StartsWith(root, StringComparison.OrdinalIgnoreCase);
        }

        public static void AbrirNavegador()
        {
            Process.Start(new ProcessStartInfo("http://127.0.0.1:4780") { UseShellExecute = true });
        }

        static void Iniciar(string node, string servidor, string datos)
        {
            bitacora = new StreamWriter(Path.Combine(datos, "estacion.log"), true, Encoding.UTF8);
            bitacora.AutoFlush = true;
            Anotar("---- " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " ----");

            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = node;
            info.Arguments = "\"" + servidor + "\"";
            info.WorkingDirectory = Path.GetDirectoryName(servidor);
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.EnvironmentVariables["ESPEJO_ROOT"] = Path.GetDirectoryName(servidor);
            info.EnvironmentVariables["ESPEJO_DATA_DIR"] = datos;

            proceso = Process.Start(info);
            proceso.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { Anotar(e.Data); };
            proceso.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { Anotar(e.Data); };
            proceso.BeginOutputReadLine();
            proceso.BeginErrorReadLine();
        }

        static void Anotar(string linea)
        {
            if (linea == null || bitacora == null) return;
            lock (candado) bitacora.WriteLine(linea);
        }

        static void Detener()
        {
            try
            {
                if (proceso != null && !proceso.HasExited) proceso.Kill();
            }
            catch (Exception) { }
            try
            {
                if (bitacora != null) bitacora.Dispose();
            }
            catch (Exception) { }
        }

        static bool InterfazLista()
        {
            try
            {
                HttpWebRequest pedido = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:4780/");
                pedido.Method = "GET";
                pedido.Timeout = 2000;
                pedido.UserAgent = "SIGEVED";
                using (HttpWebResponse respuesta = (HttpWebResponse)pedido.GetResponse())
                using (StreamReader lector = new StreamReader(respuesta.GetResponseStream()))
                {
                    string tipo = respuesta.ContentType ?? "";
                    string cuerpo = lector.ReadToEnd();
                    return (int)respuesta.StatusCode == 200
                        && tipo.IndexOf("text/html", StringComparison.OrdinalIgnoreCase) >= 0
                        && cuerpo.IndexOf("<html", StringComparison.OrdinalIgnoreCase) >= 0;
                }
            }
            catch (Exception)
            {
                return false;
            }
        }

        static bool PuertoAbierto()
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    IAsyncResult resultado = client.BeginConnect("127.0.0.1", 4780, null, null);
                    bool listo = resultado.AsyncWaitHandle.WaitOne(TimeSpan.FromMilliseconds(250));
                    if (!listo) return false;
                    client.EndConnect(resultado);
                    return true;
                }
            }
            catch (Exception)
            {
                return false;
            }
        }
    }

    sealed class Ventana : Form
    {
        public Ventana()
        {
            Text = "SIGEVED";
            Font = new Font("Segoe UI", 10f);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(460, 168);

            Label titulo = new Label();
            titulo.Text = "La estación está en marcha en esta computadora.";
            titulo.Bounds = new Rectangle(24, 20, 412, 28);

            Label nota = new Label();
            nota.Text = "Cerrar esta ventana detiene la estación. El teléfono tiene que estar en la misma red.";
            nota.Bounds = new Rectangle(24, 56, 412, 44);

            Button abrir = new Button();
            abrir.Text = "Abrir la estación";
            abrir.Bounds = new Rectangle(24, 116, 160, 32);
            abrir.Click += delegate { Program.AbrirNavegador(); };

            Controls.Add(titulo);
            Controls.Add(nota);
            Controls.Add(abrir);
        }
    }
}
