import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;

/**
 * Fallback p/ desenvolvimento local: o `vercel dev` nem sempre injeta as envs
 * do projeto nas Functions. Em produção (process.env.VERCEL), as envs reais
 * vêm do Vercel e nada é carregado do disco.
 */
export function ensureLocalEnv(): void {
  if (loaded) return;
  loaded = true;
  if (process.env.VERCEL) return;

  for (const file of [".env.vercel", ".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
      if (!match) continue;
      const key = match[1];
      if (!process.env[key]) process.env[key] = match[2];
    }
  }
}
