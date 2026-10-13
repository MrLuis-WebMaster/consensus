export type Territory = { code: string; name: string; capital: string; pilot?: boolean };

export const territories: Territory[] = [
  { code: 'CO-ANT-MED', name: 'Antioquia', capital: 'Medellín', pilot: true },
  { code: 'CO-CUN-BOG', name: 'Cundinamarca', capital: 'Bogotá' },
  { code: 'CO-VAC-CAL', name: 'Valle del Cauca', capital: 'Cali' },
  { code: 'CO-ATL-BAQ', name: 'Atlántico', capital: 'Barranquilla' },
  { code: 'CO-SAN-BGA', name: 'Santander', capital: 'Bucaramanga' },
  { code: 'CO-BOL-CTG', name: 'Bolívar', capital: 'Cartagena' },
  { code: 'CO-BOY-TUN', name: 'Boyacá', capital: 'Tunja' },
  { code: 'CO-CAL-MZL', name: 'Caldas', capital: 'Manizales' },
  { code: 'CO-CAU-POP', name: 'Cauca', capital: 'Popayán' },
  { code: 'CO-CHO-QUI', name: 'Chocó', capital: 'Quibdó' },
];

const territoryContracts = parseContracts(import.meta.env.VITE_TERRITORY_CONTRACTS);
let activeTerritory = territories[0].code;

function parseContracts(raw?: string): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const config = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(config).filter((entry): entry is [string, string] =>
      typeof entry[1] === 'string' && /^C[A-Z2-7]{55}$/.test(entry[1])));
  } catch {
    return {};
  }
}

export function availableTerritories(): string[] {
  return territories.map(({ code }) => code);
}

export function selectTerritory(territory: string): void {
  if (!availableTerritories().includes(territory)) throw new Error('Territorio fuera del alcance actual del laboratorio.');
  activeTerritory = territory;
}

export function territoryInfo(code = activeTerritory): Territory {
  const territory = territories.find((item) => item.code === code);
  if (!territory) throw new Error('Territorio fuera del alcance actual del laboratorio.');
  return territory;
}

export function activeTerritoryCode(): string {
  return activeTerritory;
}

export function activeContractId(): string | undefined {
  return territoryContracts[activeTerritory];
}
