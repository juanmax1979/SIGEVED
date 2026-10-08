import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatBytes } from "../../../../packages/shared/src/index";
import { useStore } from "../lib/store";
import { theme } from "../theme";

export default function SessionScreen() {
  const router = useRouter();
  const store = useStore();
  const pullRef = useRef(store.pullPending);
  pullRef.current = store.pullPending;

  useEffect(() => {
    if (!store.link) return;
    const timer = setInterval(() => {
      pullRef.current().catch(() => undefined);
    }, 2500);
    return () => clearInterval(timer);
  }, [store.link?.token]);

  if (!store.link) {
    return (
      <View style={styles.screen}>
        <Text style={styles.lead}>No hay una estación conectada.</Text>
        <Pressable style={styles.primary} onPress={() => router.replace("/connect")}>
          <Text style={styles.primaryText}>Conectar</Text>
        </Pressable>
      </View>
    );
  }

  const waiting = store.items.filter((item) => item.delivery !== "sent");

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.kicker}>Conectado</Text>
      <Text style={styles.title}>{store.link.caratula}</Text>
      <Text style={styles.lead}>
        La estación puede descargar los archivos de esta lista. También podés enviarlos vos. Si cerrás la conexión, no sale nada más.
      </Text>
      {store.busy ? <Text style={styles.busy}>{store.busy}</Text> : null}
      {store.items.length === 0 ? <Text style={styles.lead}>Todavía no hay archivos en EVIDIA.</Text> : null}
      {store.items.map((item) => (
        <View key={item.localId} style={styles.card}>
          <Text style={styles.filename}>{item.filename}</Text>
          <Text style={styles.meta}>
            {formatBytes(item.size)} · {statusLabel(item.delivery)}
          </Text>
          {item.detail ? <Text style={styles.meta}>{item.detail}</Text> : null}
        </View>
      ))}
      <Pressable
        style={[styles.primary, waiting.length === 0 && styles.disabled]}
        disabled={waiting.length === 0}
        onPress={() =>
          store.sendItems(waiting.map((item) => item.localId)).catch((error: unknown) => {
            console.warn(error);
          })
        }
      >
        <Text style={styles.primaryText}>Enviar los que faltan</Text>
      </Pressable>
      <Pressable
        style={styles.secondary}
        onPress={() => store.disconnectStation().then(() => router.back())}
      >
        <Text style={styles.secondaryText}>Cortar conexión</Text>
      </Pressable>
    </ScrollView>
  );
}

function statusLabel(delivery: "local" | "sending" | "sent" | "error"): string {
  if (delivery === "sent") return "Recibido";
  if (delivery === "sending") return "Enviando";
  if (delivery === "error") return "No se pudo enviar";
  return "Listo para enviar";
}

const styles = StyleSheet.create({
  screen: { padding: 18, gap: 12 },
  kicker: { color: theme.brass, letterSpacing: 1, textTransform: "uppercase", fontSize: 12 },
  title: { fontSize: 28, fontWeight: "700", color: theme.ink },
  lead: { color: theme.muted, fontSize: 16, lineHeight: 22 },
  busy: { color: theme.pine, fontWeight: "700" },
  card: { backgroundColor: theme.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.line },
  filename: { fontWeight: "700", color: theme.ink, fontSize: 16 },
  meta: { color: theme.muted, marginTop: 4 },
  primary: { backgroundColor: theme.pine, borderRadius: 16, padding: 16 },
  primaryText: { color: "#f7f1e6", textAlign: "center", fontWeight: "700" },
  secondary: { padding: 14 },
  secondaryText: { textAlign: "center", color: theme.danger, fontWeight: "700" },
  disabled: { opacity: 0.45 },
});
