import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import {
  hardenServiceWorkerUpdates,
  installControllerChangeReload,
  runBuildRecovery,
} from "./lib/appUpdate";

// Auto-update PWA: quando uma nova versão é detectada, ela é ativada na hora.
// Isso impede que bundles antigos em cache mantenham telas desatualizadas
// (ex.: totais financeiros parciais) depois de um deploy.
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
  createRoot(document.getElementById("root")!).render(<App />);
}

// Recuperação one-shot por build: limpa caches obsoletos do app/Workbox e
// recarrega UMA única vez. Nunca toca em dados de autenticação (sb-*) nem em
// caches de terceiros. Em caso de falha, o app sempre inicia.
runBuildRecovery(__APP_BUILD_ID__)
  .then((reloading) => {
    if (!reloading) boot();
  })
  .catch(() => boot());
