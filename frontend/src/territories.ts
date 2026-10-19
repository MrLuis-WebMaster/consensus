import divipolaRaw from './divipola_data.json';
import mechanismsRaw from './voting_mechanisms.json';

export type VotingStationEntry = {
  stationCode: string;
  name: string;
  address: string;
  tablesCount: number;
  potentialVoters: number;
  lat: number;
  lon: number;
};

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
  type: 'departamento' | 'distrito_capital' | 'exterior_pais';
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

// International Countries / Consulates ("Colombia y el mundo" — Circunscripción Internacional)
export const internationalCountries: DepartmentEntry[] = [
  {
    code: 'EXT-US',
    name: 'ESTADOS UNIDOS (Consulados)',
    normalized: 'ESTADOS UNIDOS CONSULADOS',
    type: 'exterior_pais',
    regime: 'Circunscripción Internacional — Puestos Consulares',
    capital: 'MIAMI / NUEVA YORK / WASHINGTON D.C.',
    pilot: false,
    municipalities: [
      { code: 'EXT-US-MIA', name: 'MIAMI (Consulado General)', normalized: 'MIAMI', category: 'Consulado Exterior', is_capital: true, pilot: false, lat: 25.7617, lon: -80.1918 },
      { code: 'EXT-US-NYC', name: 'NUEVA YORK (Consulado General)', normalized: 'NUEVA YORK', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: 40.7128, lon: -74.006 },
      { code: 'EXT-US-WAS', name: 'WASHINGTON D.C. (Sección Consular)', normalized: 'WASHINGTON DC', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: 38.9072, lon: -77.0369 },
      { code: 'EXT-US-HOU', name: 'HOUSTON (Consulado)', normalized: 'HOUSTON', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: 29.7604, lon: -95.3698 },
      { code: 'EXT-US-ORL', name: 'ORLANDO (Consulado)', normalized: 'ORLANDO', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: 28.5383, lon: -81.3792 },
    ],
  },
  {
    code: 'EXT-ES',
    name: 'ESPAÑA (Consulados)',
    normalized: 'ESPANA CONSULADOS',
    type: 'exterior_pais',
    regime: 'Circunscripción Internacional — Puestos Consulares',
    capital: 'MADRID',
    pilot: false,
    municipalities: [
      { code: 'EXT-ES-MAD', name: 'MADRID (Consulado General)', normalized: 'MADRID', category: 'Consulado Exterior', is_capital: true, pilot: false, lat: 40.4168, lon: -3.7038 },
      { code: 'EXT-ES-BCN', name: 'BARCELONA (Consulado General)', normalized: 'BARCELONA', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: 41.3874, lon: 2.1686 },
      { code: 'EXT-ES-VLC', name: 'VALENCIA (Consulado)', normalized: 'VALENCIA', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: 39.4699, lon: -0.3763 },
      { code: 'EXT-ES-SVQ', name: 'SEVILLA (Consulado)', normalized: 'SEVILLA', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: 37.3891, lon: -5.9845 },
    ],
  },
  {
    code: 'EXT-VE',
    name: 'VENEZUELA (Puestos Internacionales)',
    normalized: 'VENEZUELA CONSULADOS',
    type: 'exterior_pais',
    regime: 'Circunscripción Internacional — América del Sur',
    capital: 'CARACAS',
    pilot: false,
    municipalities: [
      { code: 'EXT-VE-CCS', name: 'CARACAS (Sección Consular)', normalized: 'CARACAS', category: 'Consulado Exterior', is_capital: true, pilot: false, lat: 10.4806, lon: -66.9036 },
      { code: 'EXT-VE-MAR', name: 'MARACAIBO (Consulado)', normalized: 'MARACAIBO', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: 10.6427, lon: -71.6125 },
      { code: 'EXT-VE-MUN', name: 'SAN CRISTÓBAL / TÁCHIRA', normalized: 'SAN CRISTOBAL', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: 7.7669, lon: -72.225 },
    ],
  },
  {
    code: 'EXT-PA',
    name: 'PANAMÁ (Consulados)',
    normalized: 'PANAMA CONSULADOS',
    type: 'exterior_pais',
    regime: 'Circunscripción Internacional — Centroamérica',
    capital: 'CIUDAD DE PANAMÁ',
    pilot: false,
    municipalities: [
      { code: 'EXT-PA-PTY', name: 'CIUDAD DE PANAMÁ (Consulado General)', normalized: 'CIUDAD DE PANAMA', category: 'Consulado Exterior', is_capital: true, pilot: false, lat: 8.9824, lon: -79.5199 },
      { code: 'EXT-PA-COL', name: 'COLÓN (Consulado)', normalized: 'COLON', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: 9.3547, lon: -79.9001 },
    ],
  },
  {
    code: 'EXT-CR',
    name: 'COSTA RICA (Consulados)',
    normalized: 'COSTA RICA CONSULADOS',
    type: 'exterior_pais',
    regime: 'Circunscripción Internacional — Centroamérica',
    capital: 'SAN JOSÉ',
    pilot: false,
    municipalities: [
      { code: 'EXT-CR-SJO', name: 'SAN JOSÉ DE COSTA RICA (Consulado)', normalized: 'SAN JOSE DE COSTA RICA', category: 'Consulado Exterior', is_capital: true, pilot: false, lat: 9.9281, lon: -84.0907 },
    ],
  },
  {
    code: 'EXT-EC',
    name: 'ECUADOR (Consulados)',
    normalized: 'ECUADOR CONSULADOS',
    type: 'exterior_pais',
    regime: 'Circunscripción Internacional — América del Sur',
    capital: 'QUITO',
    pilot: false,
    municipalities: [
      { code: 'EXT-EC-UIO', name: 'QUITO (Consulado General)', normalized: 'QUITO', category: 'Consulado Exterior', is_capital: true, pilot: false, lat: -0.1807, lon: -78.4678 },
      { code: 'EXT-EC-GYE', name: 'GUAYAQUIL (Consulado)', normalized: 'GUAYAQUIL', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: -2.171, lon: -79.9224 },
      { code: 'EXT-EC-TUL', name: 'TULCÁN (Consulado Fronterizo)', normalized: 'TULCAN', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: 0.8119, lon: -77.7173 },
    ],
  },
  {
    code: 'EXT-MX',
    name: 'MÉXICO (Consulados)',
    normalized: 'MEXICO CONSULADOS',
    type: 'exterior_pais',
    regime: 'Circunscripción Internacional — Norteamérica',
    capital: 'CIUDAD DE MÉXICO',
    pilot: false,
    municipalities: [
      { code: 'EXT-MX-MEX', name: 'CIUDAD DE MÉXICO (Consulado General)', normalized: 'CIUDAD DE MEXICO', category: 'Consulado Exterior', is_capital: true, pilot: false, lat: 19.4326, lon: -99.1332 },
      { code: 'EXT-MX-CUN', name: 'CANCÚN (Consulado)', normalized: 'CANCUN', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: 21.1619, lon: -86.8515 },
    ],
  },
  {
    code: 'EXT-DO',
    name: 'REPÚBLICA DOMINICANA / CARIBE',
    normalized: 'REPUBLICA DOMINICANA CARIBE',
    type: 'exterior_pais',
    regime: 'Circunscripción Internacional — Caribe',
    capital: 'SANTO DOMINGO',
    pilot: false,
    municipalities: [
      { code: 'EXT-DO-SDQ', name: 'SANTO DOMINGO (Consulado)', normalized: 'SANTO DOMINGO', category: 'Consulado Exterior', is_capital: true, pilot: false, lat: 18.4861, lon: -69.9312 },
      { code: 'EXT-JM-KIN', name: 'KINGSTON, JAMAICA (Consulado)', normalized: 'KINGSTON JAMAICA', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: 18.0179, lon: -76.8099 },
      { code: 'EXT-PR-SJU', name: 'SAN JUAN, PUERTO RICO (Consulado)', normalized: 'SAN JUAN PUERTO RICO', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: 18.4655, lon: -66.1057 },
      { code: 'EXT-TT-POS', name: 'PUERTO ESPAÑA, TRINIDAD Y TOBAGO', normalized: 'PUERTO ESPANA TRINIDAD', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: 10.6549, lon: -61.5019 },
    ],
  },
  {
    code: 'EXT-BR',
    name: 'BRASIL / GUYANA / SURINAM',
    normalized: 'BRASIL CONSULADOS',
    type: 'exterior_pais',
    regime: 'Circunscripción Internacional — América del Sur',
    capital: 'BRASILIA / SÃO PAULO',
    pilot: false,
    municipalities: [
      { code: 'EXT-BR-MAO', name: 'MANAOS, BRASIL (Consulado)', normalized: 'MANAOS BRASIL', category: 'Consulado Exterior', is_capital: true, pilot: false, lat: -3.119, lon: -60.0217 },
      { code: 'EXT-BR-GRU', name: 'SÃO PAULO, BRASIL (Consulado)', normalized: 'SAO PAULO BRASIL', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: -23.5505, lon: -46.6333 },
      { code: 'EXT-GY-GEO', name: 'GEORGETOWN, GUYANA (Puesto Consular)', normalized: 'GEORGETOWN GUYANA', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: 6.8013, lon: -58.1551 },
    ],
  },
  {
    code: 'EXT-PE',
    name: 'PERÚ / CHILE / ARGENTINA',
    normalized: 'PERU CHILE ARGENTINA CONSULADOS',
    type: 'exterior_pais',
    regime: 'Circunscripción Internacional — Cono Sur',
    capital: 'LIMA / SANTIAGO / BUENOS AIRES',
    pilot: false,
    municipalities: [
      { code: 'EXT-PE-LIM', name: 'LIMA, PERÚ (Consulado General)', normalized: 'LIMA PERU', category: 'Consulado Exterior', is_capital: true, pilot: false, lat: -12.0464, lon: -77.0428 },
      { code: 'EXT-CL-SCL', name: 'SANTIAGO DE CHILE (Consulado General)', normalized: 'SANTIAGO DE CHILE', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: -33.4489, lon: -70.6693 },
      { code: 'EXT-AR-BUE', name: 'BUENOS AIRES, ARGENTINA (Consulado)', normalized: 'BUENOS AIRES ARGENTINA', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: -34.6037, lon: -58.3816 },
    ],
  },
  {
    code: 'EXT-EU',
    name: 'EUROPA Y RESTO DEL MUNDO',
    normalized: 'EUROPA CANADA FRANCIA REINO UNIDO',
    type: 'exterior_pais',
    regime: 'Circunscripción Internacional — Global',
    capital: 'PARÍS / LONDRES / TORONTO',
    pilot: false,
    municipalities: [
      { code: 'EXT-FR-PAR', name: 'PARÍS, FRANCIA (Consulado General)', normalized: 'PARIS FRANCIA', category: 'Consulado Exterior', is_capital: true, pilot: false, lat: 48.8566, lon: 2.3522 },
      { code: 'EXT-GB-LON', name: 'LONDRES, REINO UNIDO (Consulado General)', normalized: 'LONDRES REINO UNIDO', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: 51.5072, lon: -0.1276 },
      { code: 'EXT-CA-YYZ', name: 'TORONTO, CANADÁ (Consulado General)', normalized: 'TORONTO CANADA', category: 'Consulado Exterior', is_capital: false, pilot: false, lat: 43.6532, lon: -79.3832 },
    ],
  },
];

export const allTerritorialEntities: DepartmentEntry[] = [
  ...allDepartments,
  ...internationalCountries,
];

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
let activeVotingStationCode = '05001-P01';
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
    allTerritorialEntities.find((d) => d.code === deptCode) ?? allDepartments[0]
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
  for (const dept of allTerritorialEntities) {
    const found = dept.municipalities.find((m) => m.code === mpioCode);
    if (found) return found;
  }
  return allDepartments[0].municipalities[0];
}

export function getVotingStationsForMunicipality(
  deptCode = activeDepartmentCode,
  mpioCode = activeMunicipalityCode,
): VotingStationEntry[] {
  const dept = getDepartmentByCode(deptCode);
  const mpio = getMunicipalityByCode(mpioCode);
  const isExterior = dept.type === 'exterior_pais';
  const isCap = mpio.is_capital;

  if (isExterior) {
    return [
      {
        stationCode: `${mpio.code}-P01`,
        name: `Puesto Consular 01 — Sede Principal ${mpio.name}`,
        address: `Sección Consular de Colombia en ${mpio.name}`,
        tablesCount: 24,
        potentialVoters: 9600,
        lat: mpio.lat,
        lon: mpio.lon,
      },
      {
        stationCode: `${mpio.code}-P02`,
        name: `Puesto Consular 02 — Recinto Ferial / Centro Cívico ${mpio.name}`,
        address: `Centro de Convenciones Habilitado — ${mpio.name}`,
        tablesCount: 18,
        potentialVoters: 7200,
        lat: Number((mpio.lat + 0.012).toFixed(5)),
        lon: Number((mpio.lon - 0.014).toFixed(5)),
      },
    ];
  }

  const stations: VotingStationEntry[] = [
    {
      stationCode: `${mpio.code}-P01`,
      name: `Puesto 01 — Cabecera Principal / Plaza Central de ${mpio.name}`,
      address: `Parque Principal — Cabecera Municipal (${mpio.name}, ${dept.name})`,
      tablesCount: isCap ? 45 : 14,
      potentialVoters: isCap ? 18000 : 5600,
      lat: mpio.lat,
      lon: mpio.lon,
    },
    {
      stationCode: `${mpio.code}-P02`,
      name: `Puesto 02 — Institución Educativa Departamental ${mpio.name}`,
      address: `Sector Educativo Central — ${mpio.name} [DIVIPOLA ${mpio.code}]`,
      tablesCount: isCap ? 36 : 10,
      potentialVoters: isCap ? 14400 : 4000,
      lat: Number((mpio.lat + 0.0085).toFixed(5)),
      lon: Number((mpio.lon + 0.0075).toFixed(5)),
    },
    {
      stationCode: `${mpio.code}-P03`,
      name: `Puesto 03 — Coliseo Polideportivo y Centro Cívico ${mpio.name}`,
      address: `Unidad Deportiva Municipal — ${mpio.name}`,
      tablesCount: isCap ? 32 : 8,
      potentialVoters: isCap ? 12800 : 3200,
      lat: Number((mpio.lat - 0.0075).toFixed(5)),
      lon: Number((mpio.lon - 0.0082).toFixed(5)),
    },
  ];

  if (isCap) {
    stations.push(
      {
        stationCode: `${mpio.code}-P04`,
        name: `Puesto 04 — Campus Universitario / Ciudadela Educativa ${mpio.name}`,
        address: `Avenida Universitaria — ${mpio.name}`,
        tablesCount: 52,
        potentialVoters: 20800,
        lat: Number((mpio.lat + 0.016).toFixed(5)),
        lon: Number((mpio.lon - 0.013).toFixed(5)),
      },
      {
        stationCode: `${mpio.code}-P05`,
        name: `Puesto 05 — Recinto Ferial y Centro de Convenciones ${mpio.name}`,
        address: `Distrito Cívico Metropolitano — ${mpio.name}`,
        tablesCount: 60,
        potentialVoters: 24000,
        lat: Number((mpio.lat - 0.015).toFixed(5)),
        lon: Number((mpio.lon + 0.014).toFixed(5)),
      },
    );
  }

  return stations;
}

export function selectDepartmentAndMunicipality(
  deptCode: string,
  mpioCode?: string,
  stationCode?: string,
): {
  department: DepartmentEntry;
  municipality: MunicipalityEntry;
  station: VotingStationEntry;
} {
  const dept = getDepartmentByCode(deptCode);
  activeDepartmentCode = dept.code;
  const targetMpio =
    (mpioCode && dept.municipalities.find((m) => m.code === mpioCode)) ||
    dept.municipalities.find((m) => m.is_capital) ||
    dept.municipalities[0];
  activeMunicipalityCode = targetMpio.code;
  activeTerritory = dept.code === '05' ? 'CO-ANT-MED' : `CO-${dept.code}`;
  const stations = getVotingStationsForMunicipality(dept.code, targetMpio.code);
  const targetStation =
    (stationCode && stations.find((s) => s.stationCode === stationCode)) ||
    stations[0];
  activeVotingStationCode = targetStation.stationCode;
  return { department: dept, municipality: targetMpio, station: targetStation };
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
  for (const dept of allTerritorialEntities) {
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
    selectDepartmentAndMunicipality(territory);
    return;
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
  stationCode: string;
} {
  return {
    departmentCode: activeDepartmentCode,
    municipalityCode: activeMunicipalityCode,
    stationCode: activeVotingStationCode,
  };
}

export function activeContractId(): string | undefined {
  return (
    territoryContracts[activeTerritory] ??
    territoryContracts[activeDepartmentCode] ??
    territoryContracts[activeMunicipalityCode]
  );
}
