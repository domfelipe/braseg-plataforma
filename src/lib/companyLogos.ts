// Maps company CNPJ to logo path
const logoMap: Record<string, string> = {
  "30.636.545/0001-50": "/logos/acudir.png",        // Acudir Health
  "57.016.034/0001-91": "/logos/vgaf-eventos.png",   // VGAF Eventos
};

// Fallback: match by trade_name or name keywords
const nameLogoMap: Array<{ keyword: string; logo: string }> = [
  { keyword: "forte", logo: "/logos/forte-servicos.png" },
  { keyword: "smg", logo: "/logos/smg-servicos.png" },
  { keyword: "roversi", logo: "/logos/roversi-servicos.png" },
  { keyword: "acudir", logo: "/logos/acudir.png" },
  { keyword: "vgaf", logo: "/logos/vgaf-eventos.png" },
  { keyword: "escritório", logo: "/logos/escritorio.png" },
  { keyword: "escritorio", logo: "/logos/escritorio.png" },
];

export function getCompanyLogo(cnpj?: string, name?: string, tradeName?: string): string | null {
  if (cnpj && logoMap[cnpj]) return logoMap[cnpj];

  const searchName = (tradeName || name || "").toLowerCase();
  const match = nameLogoMap.find((m) => searchName.includes(m.keyword));
  return match?.logo || null;
}
