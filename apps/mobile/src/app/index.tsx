import { Camera } from "expo-camera";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatBytes } from "../../../../packages/shared/src/index";
import { useStore, type LocalEvidence } from "../lib/store";
import { institutionTitle, theme } from "../theme";
import { Logo } from "../components/Logo";

export default function HomeScreen() {
  const router = useRouter();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [working, setWorking] = useState(false);

  async function keep(assets: ImagePicker.ImagePickerAsset[], source: LocalEvidence["source"]) {
    setWorking(true);
    try {
      for (const asset of assets) {
        await store.addFromUri({
          uri: asset.uri,
          filename: asset.fileName,
          mime: asset.mimeType,
          source,
        });
      }
    } catch (error) {
      Alert.alert("No se pudo guardar", error instanceof Error ? error.message : "Probá de nuevo.");
    } finally {
      setWorking(false);
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Cámara", "Hace falta permiso para fotografiar evidencia.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
    if (!result.canceled) await keep(result.assets, "camera");
  }

  async function recordVideo() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Cámara", "Hace falta permiso para filmar evidencia.");
      return;
    }
    if (Platform.OS === "ios") {
      const microphone = await Camera.requestMicrophonePermissionsAsync();
      if (!microphone.granted) {
        Alert.alert("Micrófono", "Hace falta permiso para grabar el audio del video.");
        return;
      }
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
      videoMaxDuration: 300,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
    });
    if (!result.canceled) await keep(result.assets, "camera");
  }

  async function pickGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Galería", "Hace falta permiso para elegir fotos o videos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      quality: 1,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
      shouldDownloadFromNetwork: true,
    });
    if (!result.canceled) await keep(result.assets, "gallery");
  }

  async function pickDocument() {
    setWorking(true);
    try {
      const picked = await File.pickFileAsync({ multipleFiles: true });
      const files = normalizePicked(picked);
      for (const file of files) {
        await store.addFromUri({ uri: file.uri, filename: file.name, mime: file.type, source: "document" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/cancel/i.test(message)) Alert.alert("Documento", message || "No se pudo adjuntar el archivo.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.brandBlock}>
        <Logo size={64} />
        <Text style={styles.brandName}>SIGVED</Text>
      </View>
      <Text style={styles.system}>Sistema Integrado de Gestión Voluntario de Evidencia Digital</Text>
      <Text style={styles.institution}>{institutionTitle}</Text>
      <Text style={styles.lead}>
        {Platform.OS === "ios"
          ? "Las fotos, videos y documentos quedan en este iPhone hasta que los envíes a la estación por Wi-Fi. Nada se comparte solo."
          : "Las fotos, videos y documentos quedan en este teléfono hasta que los envíes a la estación. Nada se comparte solo. Si conectan el cable USB, la computadora mira la pantalla y guarda esas capturas."}
      </Text>
      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={takePhoto}>
          <Text style={styles.actionText}>Tomar foto</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={recordVideo}>
          <Text style={styles.actionText}>Grabar video</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={pickGallery}>
          <Text style={styles.actionText}>Elegir de la galería</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={pickDocument}>
          <Text style={styles.actionText}>Adjuntar documento</Text>
        </Pressable>
      </View>
      <Pressable style={styles.connect} onPress={() => router.push(store.link ? "/session" : "/connect")}>
        <Text style={styles.connectText}>{store.link ? "Volver a la estación" : "Conectar con la estación"}</Text>
      </Pressable>
      <FlatList
        data={store.items}
        keyExtractor={(item) => item.localId}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        ListEmptyComponent={<Text style={styles.empty}>Todavía no hay evidencia guardada.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/item/${item.localId}`)}>
            <Text style={styles.filename}>{item.filename}</Text>
            <Text style={styles.meta}>
              {formatBytes(item.size)} · {labelDelivery(item.delivery)}
            </Text>
          </Pressable>
        )}
      />
      {working || store.busy ? (
        <View style={styles.overlay}>
          <ActivityIndicator color={theme.pine} size="large" />
          <Text style={styles.overlayText}>{store.busy || "Guardando…"}</Text>
        </View>
      ) : null}
    </View>
  );
}

function labelDelivery(delivery: LocalEvidence["delivery"]): string {
  if (delivery === "sent") return "En la estación";
  if (delivery === "sending") return "Enviando";
  if (delivery === "error") return "Error al enviar";
  return "Solo en este teléfono";
}

function normalizePicked(picked: unknown): File[] {
  if (Array.isArray(picked)) return picked as File[];
  if (picked && typeof picked === "object") {
    const value = picked as { canceled?: boolean; result?: File[]; uri?: string };
    if (value.canceled) return [];
    if (Array.isArray(value.result)) return value.result;
    if (value.uri) return [picked as File];
  }
  return [];
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 18, gap: 12 },
  brandBlock: { alignItems: "center", gap: 4, paddingTop: 8 },
  brandName: { color: theme.ink, fontSize: 28, fontWeight: "800", letterSpacing: 3 },
  system: { color: theme.muted, fontSize: 15, lineHeight: 21, textAlign: "center" },
  institution: { color: theme.blue, fontSize: 14, fontWeight: "700", textAlign: "center" },
  lead: { color: theme.muted, fontSize: 16, lineHeight: 22 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: {
    backgroundColor: theme.card,
    borderColor: theme.line,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  actionText: { color: theme.ink, fontSize: 15, fontWeight: "600" },
  connect: { backgroundColor: theme.pine, borderRadius: 16, padding: 16 },
  connectText: { color: "#f7f1e6", textAlign: "center", fontSize: 16, fontWeight: "700" },
  list: { gap: 10, paddingBottom: 24 },
  card: { backgroundColor: theme.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.line },
  filename: { fontSize: 16, color: theme.ink, fontWeight: "600" },
  meta: { color: theme.muted, marginTop: 4 },
  empty: { color: theme.muted, marginTop: 12 },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(244,239,230,0.92)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  overlayText: { color: theme.ink, fontSize: 16, textAlign: "center" },
});
