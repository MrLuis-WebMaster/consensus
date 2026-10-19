import divipolaRaw from './divipola_data.json';
import mechanismsRaw from './voting_mechanisms.json';

export type MunicipalityEntry = {
  code: string;
  name: string;
  normalized: string;
  category: string;
  is_capital: boolean;
  pilot: boolean;
  lat: number;
  lon: number;
};

export type DepartmentEntry = {
  code: string;
  name: string;
  normalized: string;
  type: 'departamento' | 'distrito_capital';
  regime: string;
  capital: string;
  pilot: boolean;
  municipalities: MunicipalityEntry[];
};

export type Territory = {
  code: string;
  departmentCode: string;
  municipalityCode: string;
  name: string;
  capital: string;
  regime: string;
  pilot?: boolean;
};

export type VotingMechanismTemplate = {
  template_id: string;
  category: string;
  name: string;
  normative_basis: string;
  is_ballot_centrist: boolean;
  deliberation_flow_required: boolean;
  description: string;
  default_rules: {
    max_selections: number;
    blank_vote_enabled: boolean;
    allow_unmarked_vote: boolean;
    allow_null_vote_simulation: boolean;
    territorial_scope: string;
    participation_threshold_pct: number;
    required_majority_rule: string;
    tie_breaker_rule: string;
    tally_rule: string;
    results_publication_mode: string;
    process_states: string[];
    cancellation_grounds: string[];
  };
  educational_vs_legal_note: string;
};

export const divipolaMetadata = divipolaRaw.metadata;
export const allDepartments: DepartmentEntry[] = divipolaRaw.departments as DepartmentEntry[];
export const votingMechanismTemplates: VotingMechanismTemplate[] =
  mechanismsRaw.templates as VotingMechanismTemplate[];

export const territories: Territory[] = allDepartments.map((dept) => {
  const capMpio =
    dept.municipalities.find((m) => m.is_capital) ?? dept.municipalities[0];
  return {
    code: dept.code === '05' ? 'CO-ANT-MED' : `CO-${dept.code}`,
    departmentCode: dept.code,
    municipalityCode: capMpio?.code ?? `${dept.code}001`,
    name: dept.name,
    capital: dept.capital || capMpio?.name || dept.name,
    regime: dept.regime,
    pilot: dept.pilot,
  };
});

const territoryContracts = parseContracts(import.meta.env.VITE_TERRITORY_CONTRACTS);
let activeDepartmentCode = '05';
let activeMunicipalityCode = '05001';
let activeTerritory = 'CO-ANT-MED';

function parseContracts(raw?: string): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const config = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(config).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' && /^C[A-Z2-7]{55}$/.test(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

export function getDepartmentByCode(deptCode = activeDepartmentCode): DepartmentEntry {
  return (
    allDepartments.find((d) => d.code === deptCode) ?? allDepartments[0]
  );
}

export function getMunicipalitiesForDepartment(
  deptCode = activeDepartmentCode,
): MunicipalityEntry[] {
  return getDepartmentByCode(deptCode).municipalities;
}

export function getMunicipalityByCode(
  mpioCode = activeMunicipalityCode,
): MunicipalityEntry {
  for (const dept of allDepartments) {
    const found = dept.municipalities.find((m) => m.code === mpioCode);
    if (found) return found;
  }
  return allDepartments[0].municipalities[0];
}

export function selectDepartmentAndMunicipality(
  deptCode: string,
  mpioCode?: string,
): { department: DepartmentEntry; municipality: MunicipalityEntry } {
  const dept = getDepartmentByCode(deptCode);
  activeDepartmentCode = dept.code;
  const targetMpio =
    (mpioCode && dept.municipalities.find((m) => m.code === mpioCode)) ||
    dept.municipalities.find((m) => m.is_capital) ||
    dept.municipalities[0];
  activeMunicipalityCode = targetMpio.code;
  activeTerritory = dept.code === '05' ? 'CO-ANT-MED' : `CO-${dept.code}`;
  return { department: dept, municipality: targetMpio };
}

export function searchMunicipalities(query: string): Array<{
  departmentCode: string;
  departmentName: string;
  municipality: MunicipalityEntry;
}> {
  const needle = normalizeSearchText(query);
  if (needle.length < 2) return [];
  const results: Array<{
    departmentCode: string;
    departmentName: string;
    municipality: MunicipalityEntry;
  }> = [];
  for (const dept of allDepartments) {
    for (const mpio of dept.municipalities) {
      if (
        mpio.normalized.includes(needle) ||
        dept.normalized.includes(needle) ||
        mpio.code.includes(needle)
      ) {
        results.push({
          departmentCode: dept.code,
          departmentName: dept.name,
          municipality: mpio,
        });
        if (results.length >= 30) return results;
      }
    }
  }
  return results;
}

export function availableTerritories(): string[] {
  return territories.map(({ code }) => code);
}

export function selectTerritory(territory: string): void {
  const match = territories.find(
    (t) => t.code === territory || t.departmentCode === territory,
  );
  if (!match) {
    throw new Error('Territorio fuera del catálogo DIVIPOLA.');
  }
  selectDepartmentAndMunicipality(match.departmentCode, match.municipalityCode);
}

export function territoryInfo(code = activeTerritory): Territory {
  const territory = territories.find(
    (item) => item.code === code || item.departmentCode === code,
  );
  if (!territory) return territories[0];
  return territory;
}

export function activeTerritoryCode(): string {
  return activeTerritory;
}

export function activeDivipolaCodes(): {
  departmentCode: string;
  municipalityCode: string;
} {
  return {
    departmentCode: activeDepartmentCode,
    municipalityCode: activeMunicipalityCode,
  };
}

export function activeContractId(): string | undefined {
  return (
    territoryContracts[activeTerritory] ??
    territoryContracts[activeDepartmentCode] ??
    territoryContracts[activeMunicipalityCode]
  );
}
