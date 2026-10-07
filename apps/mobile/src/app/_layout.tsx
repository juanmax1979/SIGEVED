import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StoreProvider } from "../lib/store";
import { theme } from "../theme";

export default function RootLayout() {
  return (
    <StoreProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.pine },
          headerTintColor: "#f7f1e6",
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: theme.paper },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Espejo" }} />
        <Stack.Screen name="item/[id]" options={{ title: "Evidencia" }} />
        <Stack.Screen name="connect" options={{ title: "Conectar" }} />
        <Stack.Screen name="session" options={{ title: "Estación" }} />
      </Stack>
    </StoreProvider>
  );
}
