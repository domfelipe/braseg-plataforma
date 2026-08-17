// Deterministic company_id + city contract for the WhatsApp minimal flow.
// Source of truth mirrors src/lib/companyLocations.ts (EMPRESA CIDADE contract).
// Aliases only cover variations already used historically in the project.

export const COMPANY_IDS = {
  ACUDIR: "7690fb96-6492-48ad-a410-f39092987db6",
  FORTE: "c963c261-bde2-4da9-9f02-829e8e48d25c",
  ROVERSI: "cb494ec4-d109-4541-aada-e5e07ab4e03e",
  SMG: "da1f794b-d847-4137-a0b8-f1a932bce3b8",
  VGAF: "6517a33a-ac87-4644-b300-4327c46dcbd0",
  ESCRITORIO: "e8f5e3a1-1b2c-4d5e-9f0a-1b2c3d4e5f6a",
} as const;

// canonical city -> accepted aliases (canonical form is always accepted)
type CityMap = Record<string, string[]>;

const COMPANY_CITY_CONTRACT: Record<string, CityMap> = {
  [COMPANY_IDS.ACUDIR]: {
    "Botucatu": [],
    "Mineiros": ["Mineiros do Tiete"],
    // Historical spelling variations of the same location
    "Igarassu": ["Igaracu", "Igaracu do Tiete", "Igaracu Tiete"],
    "Escritório Lençóis": ["Escritorio Lencois", "Escritorio Lencois Paulista"],
    "Marília": [],
  },
  [COMPANY_IDS.FORTE]: {
    "Botucatu": [],
    "Campos": [],
    "Ribeirão": [],
    "Supera": [],
    "UBS": ["BS"],
  },
  [COMPANY_IDS.ROVERSI]: {
    "Dois Córregos": [],
    "Lençóis Paulista": [],
    "Itatinga": [],
    "Pinhalzinho": [],
  },
  [COMPANY_IDS.SMG]: {
    "Jardinópolis": [],
    "Votorantim": [],
    "Metrô": ["Metro"],
  },
  [COMPANY_IDS.VGAF]: {
    "Lençóis Paulista": [],
  },
  [COMPANY_IDS.ESCRITORIO]: {
    "Escritório": [],
  },
};

export function normalizeCityKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export type CityResolution =
  | { ok: true; city: string }
  | { ok: false; reason: "invalid_company_or_city" };

/**
 * Resolves the canonical city for a (company_id, city) pair.
 * Never falls back to another company's city and never guesses by approximation.
 */
export function resolveCanonicalCity(
  companyId: unknown,
  city: unknown,
): CityResolution {
  const id = String(companyId ?? "").trim();
  const contract = COMPANY_CITY_CONTRACT[id];
  if (!contract) return { ok: false, reason: "invalid_company_or_city" };

  const key = normalizeCityKey(city);
  if (!key) return { ok: false, reason: "invalid_company_or_city" };

  const matches = Object.entries(contract).filter(([canonical, aliases]) => {
    if (normalizeCityKey(canonical) === key) return true;
    return aliases.some((a) => normalizeCityKey(a) === key);
  });

  if (matches.length !== 1) return { ok: false, reason: "invalid_company_or_city" };
  return { ok: true, city: matches[0][0] };
}

export function getContractCities(companyId: string): string[] {
  return Object.keys(COMPANY_CITY_CONTRACT[companyId] ?? {});
}
