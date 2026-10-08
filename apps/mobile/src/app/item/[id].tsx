import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { formatBytes, labelCategory } from "../../../../../packages/shared/src/index";
import { categories, fileFor, useStore } from "../../lib/store";
import { theme } from "../../theme";

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const store = useStore();
  const item = store.items.find((entry) => entry.localId === id);
  const [note, setNote] = useState(item?.note ?? "");

  if (!item) {
    return (
      <View style={styles.screen}>
        <Text style={styles.meta}>Ese archivo ya no está en el teléfono.</Text>
      </View>
    );
  }

  const preview = fileFor(item);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {item.mime.startsWith("image/") ? <Image source={{ uri: preview.uri }} style={styles.preview} /> : null}
      <Text style={styles.title}>{item.filename}</Text>
      <Text style={styles.meta}>
        {formatBytes(item.size)} · {new Date(item.capturedAt).toLocaleString()}
      </Text>
      <Text style={styles.hash}>{item.sha256}</Text>
      {item.detail ? <Text style={styles.meta}>{item.detail}</Text> : null}
      <Text style={styles.label}>Categoría</Text>
      <View style={styles.chips}>
        {categories.map((category) => (
          <Pressable
            key={category.id}
            style={[styles.chip, item.category === category.id && styles.chipOn]}
            onPress={() => store.updateItem(item.localId, { category: category.id })}
          >
            <Text style={[styles.chipText, item.category === category.id && styles.chipTextOn]}>
              {labelCategory(category.id)}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Nota para quien recibe</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        onBlur={() => store.updateItem(item.localId, { note })}
        multiline
        placeholder="Qué muestra este archivo"
        placeholderTextColor={theme.muted}
        style={styles.input}
      />
      <Pressable
        style={styles.delete}
        onPress={() =>
          Alert.alert("Quitar archivo", "Se borra de EVIDIA en este teléfono.", [
            { text: "Cancelar", style: "cancel" },
            {
              text: "Quitar",
              style: "destructive",
              onPress: () => {
                store.removeItem(item.localId).then(() => router.back());
              },
            },
          ])
        }
      >
        <Text style={styles.deleteText}>Quitar de este teléfono</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 18, gap: 10 },
  preview: { width: "100%", height: 240, borderRadius: 16, backgroundColor: "#efe7da" },
  title: { fontSize: 22, fontWeight: "700", color: theme.ink },
  meta: { color: theme.muted, lineHeight: 20 },
  hash: { fontFamily: "monospace", fontSize: 12, color: theme.ink },
  label: { marginTop: 8, fontWeight: "700", color: theme.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: theme.line, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: theme.card },
  chipOn: { backgroundColor: theme.pine, borderColor: theme.pine },
  chipText: { color: theme.ink },
  chipTextOn: { color: "#f7f1e6" },
  input: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 14,
    padding: 12,
    backgroundColor: theme.card,
    textAlignVertical: "top",
    color: theme.ink,
  },
  delete: { marginTop: 12, padding: 14 },
  deleteText: { color: theme.danger, textAlign: "center", fontWeight: "700" },
});
