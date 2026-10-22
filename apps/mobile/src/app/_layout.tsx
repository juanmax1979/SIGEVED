import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { StoreProvider } from "../lib/store";
import { Logo } from "../components/Logo";
import { theme } from "../theme";

function HeaderTitle() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Logo size={28} />
      <Text style={{ color: theme.ink, fontWeight: "800", fontSize: 18, letterSpacing: 1 }}>S.I.G.E.V.E.D.</Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <StoreProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#ffffff" },
          headerTintColor: theme.blue,
          headerShadowVisible: false,
          headerTitleAlign: "center",
          headerTitle: () => <HeaderTitle />,
          contentStyle: { backgroundColor: theme.paper },
        }}
      >
        <Stack.Screen name="index" options={{ headerTitle: () => <HeaderTitle /> }} />
        <Stack.Screen name="item/[id]" options={{ title: "Evidencia" }} />
        <Stack.Screen name="connect" options={{ title: "Conectar" }} />
        <Stack.Screen name="session" options={{ title: "Estación" }} />
      </Stack>
    </StoreProvider>
  );
}
