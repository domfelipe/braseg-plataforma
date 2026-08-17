/**
 * Infraestrutura de atualização do app (service worker / cache).
 *
 * Problema tratado: clientes já abertos continuam controlados por um service
 * worker antigo e seguem servindo chunks obsoletos (ex.: index-*.js antigo),
 * mostrando totais financeiros parciais mesmo após o deploy da correção de
 * paginação.
 *
 * Estratégia:
 *  - registro imediato com atualização forçada e `updateViaCache: "none"`
 *    quando suportado, para o próprio arquivo do SW nunca vir do cache HTTP;
 *  - `skipWaiting` no worker em espera + reload ÚNICO protegido no
 *    `controllerchange`;
 *  - recuperação one-shot por build: quando o BUILD_ID muda, os caches do
 *    app/Workbox obsoletos são apagados uma única vez e o app recarrega uma
 *    única vez (flag em sessionStorage impede loop).
 *
 * Nunca remove:
 *  - chaves de autenticação do Supabase (`sb-*`) ou qualquer outro dado do
 *    localStorage;
 *  - caches de terceiros (fontes Google/gstatic).
 */

const BUILD_ID_KEY = "app_build_id";
const RECOVERY_FLAG_KEY = "app_build_recovery_done";

/** Caches do app/Workbox que podem ser descartados com segurança. */
function isStaleAppCache(name: string): boolean {
  const n = name.toLowerCase();
  if (n.includes("google-fonts") || n.includes("gstatic")) return false;
  return (
    n.startsWith("workbox") ||
    n.includes("precache") ||
    n.includes("runtime") ||
    n.startsWith("vite-pwa") ||
    n.startsWith("app-")
  );
}

async function clearStaleAppCaches(): Promise<void> {
  if (!("caches" in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter(isStaleAppCache).map((k) => caches.delete(k)));
  } catch {
    // Cache API indisponível (modo privado, permissões) — segue sem limpar.
  }
}

/**
 * Recuperação one-shot de clientes presos em um bundle antigo.
 * Retorna true quando disparou um reload (o chamador deve parar o boot).
 */
export async function runBuildRecovery(buildId: string): Promise<boolean> {
  let previous: string | null = null;
  try {
    previous = localStorage.getItem(BUILD_ID_KEY);
    localStorage.setItem(BUILD_ID_KEY, buildId);
  } catch {
    return false;
  }

  if (previous === buildId) return false;

  // Primeira visita: apenas registra o build, sem reload.
  if (previous === null) return false;

  let alreadyRecovered = false;
  try {
    alreadyRecovered = sessionStorage.getItem(RECOVERY_FLAG_KEY) === buildId;
    sessionStorage.setItem(RECOVERY_FLAG_KEY, buildId);
  } catch {
    alreadyRecovered = true;
  }

  await clearStaleAppCaches();

  if (alreadyRecovered) return false;

  window.location.reload();
  return true;
}

/** Aplica atualização imediata do service worker, sem depender do cache HTTP. */
export function hardenServiceWorkerUpdates(swUrl: string, registration?: ServiceWorkerRegistration) {
  if (!("serviceWorker" in navigator)) return;

  const reg = registration;
  if (!reg) return;

  reg.waiting?.postMessage({ type: "SKIP_WAITING" });
  reg.update().catch(() => {});

  // Re-registra o mesmo SW pedindo bypass do cache HTTP para o script do worker.
  try {
    navigator.serviceWorker.register(swUrl, { scope: "/", updateViaCache: "none" }).catch(() => {});
  } catch {
    // Navegador sem suporte a updateViaCache — o update acima já é suficiente.
  }

  reg.addEventListener("updatefound", () => {
    reg.installing?.addEventListener("statechange", () => {
      reg.waiting?.postMessage({ type: "SKIP_WAITING" });
    });
  });

  setInterval(() => {
    reg.update().catch(() => {});
  }, 60_000);
}

/** Reload único quando um novo service worker assume o controle da página. */
export function installControllerChangeReload() {
  if (!("serviceWorker" in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}
