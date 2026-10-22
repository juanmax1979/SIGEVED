import { CameraView, useCameraPermissions } from "expo-camera";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { parsePairPayload, useStore } from "../lib/store";
import { theme } from "../theme";

function mensajeConexion(error: unknown): string {
  const text = error instanceof Error ? error.message : "No se pudo conectar.";
  if (/CLEARTEXT|cleartext|App Transport Security|ATS/i.test(text)) {
    return "El teléfono bloqueó la conexión HTTP a la estación. Instalá la versión nueva de SIGEVED: esa versión permite la conexión en la red local.";
  }
  if (/local network|red local|NSURLErrorDomain|kCFErrorDomainCFNetwork|-1009/i.test(text)) {
    return "El iPhone bloqueó la red local. En Ajustes, SIGEVED, activá Red local, y revisá que el teléfono y la computadora estén en el mismo Wi-Fi.";
  }
  return text;
}

export default function ConnectScreen() {
  const router = useRouter();
  const store = useStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [locked, setLocked] = useState(false);
  const [host, setHost] = useState("http://");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState<ReturnType<typeof parsePairPayload> | null>(null);

  async function openScanner() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert("Cámara", "Podés escribir el código a mano si no querés usar la cámara.");
        return;
      }
    }
    setLocked(false);
    setScanning(true);
  }

  function acceptRaw(raw: string) {
    try {
      const payload = parsePairPayload(raw);
      setPending(payload);
      setScanning(false);
    } catch (error) {
      Alert.alert("Código", error instanceof Error ? error.message : "No se pudo leer el código.");
    }
  }

  async function confirm(target: { host: string; token: string }) {
    try {
      await store.connectStation({
        host: target.host,
        token: target.token,
        contributorName: name.trim(),
        deviceName: Constants.deviceName || "Teléfono",
      });
      router.replace("/session");
    } catch (error) {
      Alert.alert("Conexión", mensajeConexion(error));
    }
  }

  if (scanning) {
    return (
      <View style={styles.scanner}>
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={
            locked
              ? undefined
              : (event) => {
                  setLocked(true);
                  acceptRaw(event.data);
                }
          }
        />
        <Pressable style={styles.secondary} onPress={() => setScanning(false)}>
          <Text style={styles.secondaryText}>Cancelar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.lead}>
        La estación solo recibe los archivos que están en SIGEVED y que se envían durante esta conexión. Podés cortarla cuando quieras.
      </Text>
      <Text style={styles.label}>Cómo querés figurar, si querés</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Nombre o iniciales. Puede quedar vacío."
        placeholderTextColor={theme.muted}
        style={styles.input}
      />
      {pending ? (
        <View style={styles.card}>
          <Text style={styles.title}>{pending.caratula}</Text>
          <Text style={styles.meta}>Código {pending.code}</Text>
          <Pressable style={styles.primary} onPress={() => confirm(pending)}>
            <Text style={styles.primaryText}>Conectar con esta estación</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Pressable style={styles.primary} onPress={openScanner}>
            <Text style={styles.primaryText}>Escanear código</Text>
          </Pressable>
          <Text style={styles.label}>O escribirlo</Text>
          <TextInput
            value={host}
            onChangeText={setHost}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="http://192.168.0.10:4780"
            placeholderTextColor={theme.muted}
            style={styles.input}
          />
          <TextInput
            value={code}
            onChangeText={(value) => setCode(value.toUpperCase())}
            autoCapitalize="characters"
            placeholder="Código ABCD-EFGH"
            placeholderTextColor={theme.muted}
            style={styles.input}
          />
          <Pressable
            style={styles.secondary}
            onPress={() => confirm({ host: host.trim(), token: code.trim() })}
          >
            <Text style={styles.secondaryText}>Conectar con el código</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { padding: 18, gap: 12 },
  lead: { color: theme.muted, fontSize: 16, lineHeight: 22 },
  label: { fontWeight: "700", color: theme.ink, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 12,
    color: theme.ink,
  },
  primary: { backgroundColor: theme.pine, borderRadius: 16, padding: 16 },
  primaryText: { color: "#f7f1e6", textAlign: "center", fontWeight: "700", fontSize: 16 },
  secondary: { borderWidth: 1, borderColor: theme.line, borderRadius: 16, padding: 14, backgroundColor: theme.card },
  secondaryText: { textAlign: "center", color: theme.ink, fontWeight: "700" },
  card: { backgroundColor: theme.card, borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: theme.line },
  title: { fontSize: 22, fontWeight: "700", color: theme.ink },
  meta: { color: theme.muted },
  scanner: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
});
