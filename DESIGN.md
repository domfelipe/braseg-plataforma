# Braseg Portal — Design System

> Mood-guia: **"sala de controle industrial na hora dourada — painéis navy profundos, luzes de sinal âmbar, superfícies de aço claro"**.
> Seed (impeccable seed-055): âmbar-mel `oklch(0.774 0.174 65.1)`.

## 1. Paleta

Fonte de verdade em **OKLCH**; o CSS (`src/index.css`) usa os equivalentes **HSL** no mecanismo `hsl(var(--x))` do shadcn/ui, com hex documentado.

| Papel | OKLCH | HSL (CSS) | Hex aprox. |
|---|---|---|---|
| primary (âmbar-mel) | `oklch(0.72 0.17 65)` | `38 76% 53%` | `#E3A12E` |
| primary-foreground | — | `222 46% 17%` | `#17233F` |
| primary-strong | `oklch(0.60 0.15 65)` | `37 71% 42%` | `#B97E1F` |
| primary-soft | `oklch(0.96 0.05 85)` | `40 70% 93%` | `#FBF3E2` |
| accent (navy) | `oklch(0.33 0.06 255)` | `222 48% 23%` | `#1F3057` |
| accent-deep (sidebar) | `oklch(0.24 0.05 255)` | `222 46% 17%` | `#17233F` |
| accent-ink | `oklch(0.97 0.005 255)` | `218 44% 96%` | `#F2F5FA` |
| background (light) | `oklch(1 0 0)` | `0 0% 100%` | `#FFFFFF` |
| background (dark) | `oklch(0.08 0 0)` | `0 0% 7%` | `#111111` |
| card | `oklch(0.985 0 0)` | `0 0% 100%` | `#FFFFFF` |
| border | `oklch(0.90 0 0)` | `0 0% 89%` | `#E4E4E4` |
| ink (foreground) | `oklch(0.21 0 0)` | `0 0% 12%` | `#1F1F1F` |
| ink-muted | `oklch(0.50 0 0)` | `0 0% 47%` | `#787878` |
| success | `oklch(0.62 0.15 150)` | `152 64% 29%` | `#1B7A4E` |
| danger | `oklch(0.55 0.19 27)` | `6 64% 46%` | `#C0392B` |
| ring (foco) | — | `38 76% 53%` | âmbar 2px |

**Regras de contraste:** botão navy usa texto `accent-ink`; botão âmbar usa texto navy-ink `#17233F` (nunca branco sobre âmbar). Mínimo AA em todos os pares. Sidebar usa `accent-deep` com item ativo em pílula âmbar (barra lateral de 3px).

## 2. Tipografia

- **Display/títulos/KPIs:** Space Grotesk (500/700), numerais `tabular-nums` — classe Tailwind `font-display`.
- **Corpo/UI:** Inter (400/500/600).
- Escala: h1 28–30/34 · h2 20/26 · h3 16/22 · body 14/20 · small 12/16.

## 3. Geometria e motion

- Radius: 10px (cards, classe `rounded-[10px]`), 8px (botões/inputs), 999px (badges).
- Spacing scale 4px; sombras neutras sutis (`0 8px 24px rgb(23 35 63 / 0.10)` para overlays).
- Microinterações 150–250ms; `prefers-reduced-motion` desliga animações.

## 4. Proibições

Sem gradientes arco-íris, sem sombras coloridas, sem emojis como ícones, sem o look genérico de template (cards cinza idênticos). Ícones Lucide com stroke 1.75.

## 5. Fontes

Fontes self-hosted via `@fontsource` (imports em `src/main.tsx`) — sem Google Fonts em runtime.
