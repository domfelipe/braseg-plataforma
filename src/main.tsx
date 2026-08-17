import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./index.css";
import {
  hardenServiceWorkerUpdates,
  installControllerChangeReload,
  runBuildRecovery,
} from "./lib/appUpdate";

// Auto-update PWA: quando uma nova versão é detectada, ela é ativada na hora.
installControllerChangeReload();

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateServiceWorker(true);
  },
  onRegisteredSW(swUrl, registration) {
    hardenServiceWorkerUpdates(swUrl, registration);
  },
});

function boot() {
  createRoot(document.getElementById("root")!).render(
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "pk_test_ZmxlZXQtcmF2ZW4tNDE2NS5jbGVyay5hY2NvdW50cy5kZXYk"}
      afterSignOutUrl="/login"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      appearance={{
        variables: {
          colorPrimary: "#E3A12E",
          colorBackground: "#FFFFFF",
          colorText: "#1F1F1F",
          colorDanger: "#C0392B",
          borderRadius: "10px",
          fontFamily: "'Inter', system-ui, sans-serif",
        },
        elements: {
          card: { boxShadow: "none", border: "none" },
          formButtonPrimary: { backgroundColor: "#1F3057", "&:hover": { backgroundColor: "#17233F" } },
          footerActionLink: { color: "#B97E1F" },
        },
      }}
    >
      <App />
    </ClerkProvider>
  );
}

// Recuperação one-shot por build: limpa caches obsoletos do app/Workbox e
// recarrega UMA única vez. Em caso de falha, o app sempre inicia.
runBuildRecovery(__APP_BUILD_ID__)
  .then((reloading) => {
    if (!reloading) boot();
  })
  .catch(() => boot());