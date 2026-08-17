// Predefined locations per company for financial module
// Key is the company ID
// Contract: EMPRESA CIDADE (simple city names, no unit/description)

const COMPANY_LOCATIONS: Record<string, string[]> = {
  // ACUDIR SAUDE LTDA
  "7690fb96-6492-48ad-a410-f39092987db6": [
    "Botucatu",
    "Mineiros",
    "Igarassu",
    "Escritório Lençóis",
    "Marília",
  ],
  // FORTE SERVICOS LTDA
  "c963c261-bde2-4da9-9f02-829e8e48d25c": [
    "Botucatu",
    "Campos",
    "Ribeirão",
    "Supera",
    "UBS",
  ],
  // ROVERSI SERVICOS LTDA
  "cb494ec4-d109-4541-aada-e5e07ab4e03e": [
    "Dois Córregos",
    "Lençóis Paulista",
    "Itatinga",
    "Pinhalzinho",
  ],
  // SMG SERVICOS LTDA
  "da1f794b-d847-4137-a0b8-f1a932bce3b8": [
    "Jardinópolis",
    "Votorantim",
    "Metrô",
  ],
  // VGAF GESTAO DE ATIVOS LTDA
  "6517a33a-ac87-4644-b300-4327c46dcbd0": ["Lençóis Paulista"],
  // ESCRITÓRIO (kept minimal to preserve historical records)
  "e8f5e3a1-1b2c-4d5e-9f0a-1b2c3d4e5f6a": ["Escritório"],
};

export function getCompanyLocations(companyId: string): string[] {
  return COMPANY_LOCATIONS[companyId] || [];
}
