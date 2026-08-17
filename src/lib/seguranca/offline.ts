import { openDB, type IDBPDatabase } from "idb";

/** Camada offline do módulo Segurança do Trabalho: snapshot + outbox em IndexedDB. */

const DB_NAME = "braseg-seguranca";
const DB_VERSION = 1;

export interface OutboxMutation {
  client_mutation_id: string;
  client_id: string;
  entity: string;
  operation: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface SegSnapshot {
  clientId: string;
  sectors: unknown[];
  roles: unknown[];
  employees: unknown[];
  ges: unknown[];
  risks: unknown[];
  plan: unknown[];
  agents: unknown[];
  nrs: unknown[];
  savedAt: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains("snapshots")) d.createObjectStore("snapshots", { keyPath: "clientId" });
        if (!d.objectStoreNames.contains("outbox")) d.createObjectStore("outbox", { keyPath: "client_mutation_id" });
      },
    });
  }
  return dbPromise;
}

export async function saveSnapshot(snapshot: SegSnapshot): Promise<void> {
  const d = await db();
  await d.put("snapshots", snapshot);
}

export async function loadSnapshot(clientId: string): Promise<SegSnapshot | undefined> {
  const d = await db();
  return d.get("snapshots", clientId);
}

export async function enqueueMutation(m: OutboxMutation): Promise<void> {
  const d = await db();
  await d.put("outbox", m);
}

export async function listMutations(clientId?: string): Promise<OutboxMutation[]> {
  const d = await db();
  const all = (await d.getAll("outbox")) as OutboxMutation[];
  return clientId ? all.filter((m) => m.client_id === clientId) : all;
}

export async function removeMutations(ids: string[]): Promise<void> {
  const d = await db();
  const tx = d.transaction("outbox", "readwrite");
  for (const id of ids) await tx.store.delete(id);
  await tx.done;
}

// ---------------------------------------------------------------- store reativo
type Listener = () => void;
const listeners = new Set<Listener>();
let version = 0;

export const offlineStore = {
  getVersion: () => version,
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  notify(): void {
    version += 1;
    for (const fn of [...listeners]) fn();
  },
};
