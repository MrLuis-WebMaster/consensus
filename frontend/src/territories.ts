const territoryContracts = parseContracts(import.meta.env.VITE_TERRITORY_CONTRACTS);
let activeTerritory = 'CO-ANT-MED';

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
  return Object.keys(territoryContracts).length ? Object.keys(territoryContracts) : ['CO-ANT-MED'];
}

export function selectTerritory(territory: string): void {
  if (!availableTerritories().includes(territory)) throw new Error('Territorio sin contrato configurado.');
  activeTerritory = territory;
}

export function activeTerritoryCode(): string {
  return activeTerritory;
}

export function activeContractId(): string | undefined {
  return territoryContracts[activeTerritory];
}
