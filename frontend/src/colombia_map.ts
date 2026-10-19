import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  activeDivipolaCodes,
  allDepartments,
  allTerritorialEntities,
  getDepartmentByCode,
  getMunicipalityByCode,
  getVotingStationsForMunicipality,
  selectDepartmentAndMunicipality,
} from './territories';

type ClusterHub = {
  id: string;
  label: string;
  count: number;
  tier: 'orange' | 'yellow' | 'green';
  lat: number;
  lon: number;
  deptCode: string;
  mpioCode: string;
  zoomTarget: number;
};

type BluePinHub = {
  id: string;
  title: string;
  subtitle: string;
  lat: number;
  lon: number;
  deptCode: string;
  mpioCode: string;
};

// Cluster markers matching the Registraduría / Elecciones 2026 visual reference across Colombia & the World
const REGIONAL_CLUSTERS: ClusterHub[] = [
  // Colombia high-density clusters (Orange)
  {
    id: 'cl-andina',
    label: 'Región Andina Central (Antioquia, Bogotá D.C., Cundinamarca, Boyacá, Eje Cafetero)',
    count: 8598,
    tier: 'orange',
    lat: 5.95,
    lon: -75.15,
    deptCode: '05',
    mpioCode: '05001',
    zoomTarget: 8,
  },
  {
    id: 'cl-pacifico',
    label: 'Región Pacífico y Suroccidente (Valle del Cauca, Cauca, Nariño, Tolima, Huila)',
    count: 3035,
    tier: 'orange',
    lat: 3.15,
    lon: -76.52,
    deptCode: '76',
    mpioCode: '76001',
    zoomTarget: 8,
  },
  {
    id: 'cl-caribe',
    label: 'Región Caribe (Atlántico, Bolívar, Magdalena, Cesar, Córdoba, Sucre, La Guajira)',
    count: 1396,
    tier: 'orange',
    lat: 10.18,
    lon: -74.92,
    deptCode: '13',
    mpioCode: '13001',
    zoomTarget: 8,
  },
  {
    id: 'cl-santanderes',
    label: 'Nororiente y Llanos (Santander, Norte de Santander, Arauca, Casanare)',
    count: 192,
    tier: 'orange',
    lat: 5.75,
    lon: -72.05,
    deptCode: '68',
    mpioCode: '68001',
    zoomTarget: 8,
  },
  // Colombia medium clusters (Yellow)
  {
    id: 'cl-orinoquia',
    label: 'Orinoquía y Oriente (Meta, Vichada, Guainía, Guaviare)',
    count: 77,
    tier: 'yellow',
    lat: 3.65,
    lon: -69.85,
    deptCode: '50',
    mpioCode: '50001',
    zoomTarget: 7,
  },
  {
    id: 'cl-amazonia',
    label: 'Amazonía Colombiana (Caquetá, Putumayo, Amazonas, Vaupés)',
    count: 89,
    tier: 'yellow',
    lat: 1.52,
    lon: -73.25,
    deptCode: '18',
    mpioCode: '18001',
    zoomTarget: 7,
  },
  // International & Caribbean clusters (Green — matching the screenshot)
  {
    id: 'cl-san-andres',
    label: 'Archipiélago de San Andrés, Providencia y Santa Catalina',
    count: 8,
    tier: 'green',
    lat: 12.5847,
    lon: -81.7006,
    deptCode: '88',
    mpioCode: '88001',
    zoomTarget: 10,
  },
  {
    id: 'cl-panama',
    label: 'Panamá — Puestos Consulares (Ciudad de Panamá, Colón)',
    count: 3,
    tier: 'green',
    lat: 8.9824,
    lon: -79.5199,
    deptCode: 'EXT-PA',
    mpioCode: 'EXT-PA-PTY',
    zoomTarget: 9,
  },
  {
    id: 'cl-costa-rica',
    label: 'Costa Rica — Puestos Consulares (San José)',
    count: 2,
    tier: 'green',
    lat: 9.9281,
    lon: -84.0907,
    deptCode: 'EXT-CR',
    mpioCode: 'EXT-CR-SJO',
    zoomTarget: 9,
  },
  {
    id: 'cl-centroamerica-norte',
    label: 'Centroamérica Norte y México — Puestos Consulares',
    count: 4,
    tier: 'green',
    lat: 14.6349,
    lon: -89.5,
    deptCode: 'EXT-MX',
    mpioCode: 'EXT-MX-MEX',
    zoomTarget: 6,
  },
  {
    id: 'cl-rep-dominicana',
    label: 'República Dominicana — Puestos Consulares (Santo Domingo)',
    count: 3,
    tier: 'green',
    lat: 18.7357,
    lon: -70.1627,
    deptCode: 'EXT-DO',
    mpioCode: 'EXT-DO-SDQ',
    zoomTarget: 8,
  },
  {
    id: 'cl-venezuela-central',
    label: 'Venezuela — Puestos Consulares (Caracas, Maracaibo, San Cristóbal)',
    count: 6,
    tier: 'green',
    lat: 10.65,
    lon: -68.85,
    deptCode: 'EXT-VE',
    mpioCode: 'EXT-VE-CCS',
    zoomTarget: 7,
  },
  {
    id: 'cl-trinidad-oriente',
    label: 'Caribe Oriental y Trinidad y Tobago — Puestos Consulares',
    count: 5,
    tier: 'green',
    lat: 10.45,
    lon: -62.45,
    deptCode: 'EXT-DO',
    mpioCode: 'EXT-TT-POS',
    zoomTarget: 8,
  },
  {
    id: 'cl-ecuador',
    label: 'Ecuador — Puestos Consulares (Quito, Guayaquil, Tulcán)',
    count: 3,
    tier: 'green',
    lat: -1.25,
    lon: -78.85,
    deptCode: 'EXT-EC',
    mpioCode: 'EXT-EC-UIO',
    zoomTarget: 7,
  },
  {
    id: 'cl-usa',
    label: 'Estados Unidos — Puestos Consulares (Miami, Nueva York, Washington, Houston, Orlando)',
    count: 42,
    tier: 'orange',
    lat: 28.5383,
    lon: -81.3792,
    deptCode: 'EXT-US',
    mpioCode: 'EXT-US-MIA',
    zoomTarget: 5,
  },
  {
    id: 'cl-espana',
    label: 'España — Puestos Consulares (Madrid, Barcelona, Valencia, Sevilla)',
    count: 35,
    tier: 'orange',
    lat: 40.4168,
    lon: -3.7038,
    deptCode: 'EXT-ES',
    mpioCode: 'EXT-ES-MAD',
    zoomTarget: 6,
  },
  {
    id: 'cl-cono-sur',
    label: 'Perú, Chile y Argentina — Puestos Consulares (Lima, Santiago, Buenos Aires)',
    count: 14,
    tier: 'green',
    lat: -12.0464,
    lon: -77.0428,
    deptCode: 'EXT-PE',
    mpioCode: 'EXT-PE-LIM',
    zoomTarget: 4,
  },
  {
    id: 'cl-europa-global',
    label: 'Francia, Reino Unido y Canadá — Puestos Consulares',
    count: 12,
    tier: 'green',
    lat: 48.8566,
    lon: 2.3522,
    deptCode: 'EXT-EU',
    mpioCode: 'EXT-FR-PAR',
    zoomTarget: 5,
  },
];

// Blue teardrop pins matching the screenshot (Jamaica, San Juan, Georgetown, Manaos/Amazonas, etc.)
const FEATURED_BLUE_PINS: BluePinHub[] = [
  {
    id: 'pin-jamaica',
    title: 'Kingston, Jamaica',
    subtitle: 'Puesto Consular Habilitado · Caribe',
    lat: 18.0179,
    lon: -76.8099,
    deptCode: 'EXT-DO',
    mpioCode: 'EXT-JM-KIN',
  },
  {
    id: 'pin-sanjuan',
    title: 'San Juan, Puerto Rico',
    subtitle: 'Puesto Consular Habilitado · Caribe',
    lat: 18.4655,
    lon: -66.1057,
    deptCode: 'EXT-DO',
    mpioCode: 'EXT-PR-SJU',
  },
  {
    id: 'pin-georgetown',
    title: 'Georgetown, Guyana',
    subtitle: 'Circunscripción Internacional · Suramérica',
    lat: 6.8013,
    lon: -58.1551,
    deptCode: 'EXT-BR',
    mpioCode: 'EXT-GY-GEO',
  },
  {
    id: 'pin-manaos',
    title: 'Manaos / Leticia Frontera Amazónica',
    subtitle: 'Puesto Consular y Fronterizo Sur',
    lat: -3.119,
    lon: -60.0217,
    deptCode: 'EXT-BR',
    mpioCode: 'EXT-BR-MAO',
  },
  {
    id: 'pin-leticia',
    title: 'Leticia, Amazonas (91001)',
    subtitle: 'Capital Departamental · Extremo Sur de Colombia',
    lat: -4.2153,
    lon: -69.9406,
    deptCode: '91',
    mpioCode: '91001',
  },
];

function createClusterIcon(count: number, tier: 'orange' | 'yellow' | 'green'): L.DivIcon {
  const size = count >= 1000 ? 48 : count >= 50 ? 42 : 36;
  return L.divIcon({
    className: `registraduria-cluster-wrapper`,
    html: `<div class="reg-cluster reg-cluster-${tier}" style="width:${size}px;height:${size}px;"><span>${count}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createBluePinIcon(isSelected = false): L.DivIcon {
  const scale = isSelected ? 1.22 : 1;
  const fill = isSelected ? '#d93829' : '#2583d8';
  return L.divIcon({
    className: 'registraduria-blue-pin-wrapper',
    html: `
      <div class="reg-pin-box" style="transform:scale(${scale});">
        <svg viewBox="0 0 28 40" width="28" height="40" aria-hidden="true">
          <path d="M14 1C6.8 1 1 6.8 1 14c0 9.6 13 24.5 13 24.5S27 23.6 27 14C27 6.8 21.2 1 14 1z" fill="${fill}" stroke="#ffffff" stroke-width="2"/>
          <circle cx="14" cy="14" r="5" fill="#ffffff"/>
        </svg>
      </div>
    `,
    iconSize: [28, 40],
    iconAnchor: [14, 39],
    popupAnchor: [0, -36],
  });
}

function createMunicipalityDotIcon(isCapital: boolean, isSelected: boolean): L.DivIcon {
  const size = isSelected ? 18 : isCapital ? 14 : 10;
  const cls = isSelected
    ? 'reg-mpio-dot reg-mpio-dot-selected'
    : isCapital
      ? 'reg-mpio-dot reg-mpio-dot-capital'
      : 'reg-mpio-dot';
  return L.divIcon({
    className: 'registraduria-mpio-dot-wrapper',
    html: `<div class="${cls}" style="width:${size}px;height:${size}px;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -8],
  });
}

export function initInteractiveColombiaMap(
  container: HTMLElement,
  onSelectTerritory: (deptCode: string, mpioCode: string, stationCode?: string) => void,
): {
  refreshSelection: (flyToTarget?: boolean) => void;
  resetWorldColombiaView: () => void;
} {
  let showAll1122Dots = false;

  container.innerHTML = `
    <div class="reg-map-stage">
      <div id="leaflet-map-canvas" class="leaflet-map-canvas" role="region" aria-label="Mapa interactivo de puestos de votación en Colombia y el mundo"></div>
      <div class="reg-map-floating-bar">
        <button type="button" id="btn-map-toggle-1122" class="reg-map-pill-btn">
          <span>📍</span> Ver los 1,122 Municipios de Colombia en el mapa
        </button>
        <button type="button" id="btn-map-view-colombia" class="reg-map-pill-btn active">
          <span>🇨🇴</span> Vista Colombia y Caribe
        </button>
        <button type="button" id="btn-map-view-world" class="reg-map-pill-btn">
          <span>🌎</span> Vista Mundial (Consulados)
        </button>
      </div>
    </div>
  `;

  const mapCanvas = container.querySelector<HTMLElement>('#leaflet-map-canvas')!;

  // Initialize Leaflet Map matching the exact screenshot bounding area (Colombia + Caribbean + Central/Northern South America)
  const map = L.map(mapCanvas, {
    center: [8.35, -72.8],
    zoom: 5,
    minZoom: 2,
    maxZoom: 16,
    zoomControl: true,
    scrollWheelZoom: true,
  });

  // Base Tile Layers (OpenStreetMap Standard like the screenshot + Carto Voyager + Topo)
  const osmStandard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors · DANE DIVIPOLA · Consensus Colombia',
    maxZoom: 19,
  });

  const cartoLight = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    },
  );

  osmStandard.addTo(map);

  // Layer control in top-right (just like the layers button in the screenshot!)
  const clusterLayerGroup = L.layerGroup().addTo(map);
  const bluePinsLayerGroup = L.layerGroup().addTo(map);
  const activeDepartmentLayerGroup = L.layerGroup().addTo(map);
  const all1122LayerGroup = L.layerGroup();

  L.control
    .layers(
      {
        'Mapa Oficial Estándar (OpenStreetMap)': osmStandard,
        'Mapa Cartográfico Claro (Voyager)': cartoLight,
      },
      {
        'Agrupaciones Regionales y Países': clusterLayerGroup,
        'Puestos Destacados y Consulados (Pines Azules)': bluePinsLayerGroup,
        'Municipios y Puestos del Departamento Activo': activeDepartmentLayerGroup,
        'Todos los 1,122 Municipios de Colombia': all1122LayerGroup,
      },
      { position: 'topright', collapsed: true },
    )
    .addTo(map);

  // Render Regional & Country Cluster Circles (matching screenshot)
  function renderClustersAndFeaturedPins(): void {
    clusterLayerGroup.clearLayers();
    bluePinsLayerGroup.clearLayers();

    for (const cluster of REGIONAL_CLUSTERS) {
      const marker = L.marker([cluster.lat, cluster.lon], {
        icon: createClusterIcon(cluster.count, cluster.tier),
        title: `${cluster.label} (${cluster.count} puestos)`,
      });

      marker.bindPopup(`
        <div class="reg-popup">
          <span class="reg-popup-tag">${cluster.count} PUESTOS HABILITADOS</span>
          <strong>${cluster.label}</strong>
          <p>Haz clic abajo para acercar y elegir municipio y puesto de votación:</p>
          <button type="button" class="reg-popup-btn" data-popup-dept="${cluster.deptCode}" data-popup-mpio="${cluster.mpioCode}" data-popup-zoom="${cluster.zoomTarget}">
            Acercar y seleccionar región →
          </button>
        </div>
      `);

      marker.on('click', () => {
        const { department, municipality, station } = selectDepartmentAndMunicipality(
          cluster.deptCode,
          cluster.mpioCode,
        );
        onSelectTerritory(department.code, municipality.code, station.stationCode);
        map.flyTo([municipality.lat, municipality.lon], cluster.zoomTarget, {
          duration: 0.9,
        });
        renderActiveDepartmentMarkers();
      });

      clusterLayerGroup.addLayer(marker);
    }

    // Featured blue pins from screenshot + all 33 department capitals + international consulates
    for (const pin of FEATURED_BLUE_PINS) {
      const marker = L.marker([pin.lat, pin.lon], {
        icon: createBluePinIcon(false),
        title: pin.title,
      });

      marker.on('click', () => {
        const { department, municipality, station } = selectDepartmentAndMunicipality(
          pin.deptCode,
          pin.mpioCode,
        );
        onSelectTerritory(department.code, municipality.code, station.stationCode);
        map.flyTo([municipality.lat, municipality.lon], 10, { duration: 0.85 });
        renderActiveDepartmentMarkers();
      });

      bluePinsLayerGroup.addLayer(marker);
    }

    // Also add blue pins for all 33 Colombian Department Capitals & International Consulates
    for (const entity of allTerritorialEntities) {
      const capMpio =
        entity.municipalities.find((m) => m.is_capital) ?? entity.municipalities[0];
      if (!capMpio) continue;
      const m = L.marker([capMpio.lat, capMpio.lon], {
        icon: createBluePinIcon(false),
        title: `${capMpio.name} (${entity.name})`,
      });
      m.on('click', () => {
        const { department, municipality, station } = selectDepartmentAndMunicipality(
          entity.code,
          capMpio.code,
        );
        onSelectTerritory(department.code, municipality.code, station.stationCode);
        map.flyTo([municipality.lat, municipality.lon], 10, { duration: 0.85 });
        renderActiveDepartmentMarkers();
      });
      bluePinsLayerGroup.addLayer(m);
    }
  }

  // Populate all 1,122 municipalities layer for national exploration
  function buildAll1122MunicipalitiesLayer(): void {
    all1122LayerGroup.clearLayers();
    const { municipalityCode } = activeDivipolaCodes();
    for (const dept of allDepartments) {
      for (const mpio of dept.municipalities) {
        const isSel = mpio.code === municipalityCode;
        const dot = L.marker([mpio.lat, mpio.lon], {
          icon: createMunicipalityDotIcon(mpio.is_capital, isSel),
          title: `[${mpio.code}] ${mpio.name} — ${dept.name}`,
        });
        dot.on('click', () => {
          const { department, municipality, station } = selectDepartmentAndMunicipality(
            dept.code,
            mpio.code,
          );
          onSelectTerritory(department.code, municipality.code, station.stationCode);
          map.flyTo([municipality.lat, municipality.lon], 12, { duration: 0.75 });
          renderActiveDepartmentMarkers();
        });
        all1122LayerGroup.addLayer(dot);
      }
    }
  }

  // Render all municipalities of the currently active Department/Country + all Voting Stations of the selected Municipality
  function renderActiveDepartmentMarkers(): void {
    activeDepartmentLayerGroup.clearLayers();
    const { departmentCode, municipalityCode, stationCode } = activeDivipolaCodes();
    const dept = getDepartmentByCode(departmentCode);
    const activeMpio = getMunicipalityByCode(municipalityCode);
    const stations = getVotingStationsForMunicipality(departmentCode, municipalityCode);

    // 1. Plot all municipalities/cities in the selected department/country
    for (const mpio of dept.municipalities) {
      const isSelectedMpio = mpio.code === activeMpio.code;
      const dot = L.marker([mpio.lat, mpio.lon], {
        icon: createMunicipalityDotIcon(mpio.is_capital, isSelectedMpio),
        title: `[${mpio.code}] ${mpio.name} (${dept.name})`,
      });
      dot.on('click', () => {
        const sel = selectDepartmentAndMunicipality(dept.code, mpio.code);
        onSelectTerritory(sel.department.code, sel.municipality.code, sel.station.stationCode);
        map.flyTo([sel.municipality.lat, sel.municipality.lon], 12, { duration: 0.75 });
        renderActiveDepartmentMarkers();
      });
      activeDepartmentLayerGroup.addLayer(dot);
    }

    // 2. Plot Blue Pins for the Voting Stations (Puestos de Votación) of the selected municipality/city
    for (const st of stations) {
      const isSelectedStation = st.stationCode === stationCode;
      const pin = L.marker([st.lat, st.lon], {
        icon: createBluePinIcon(isSelectedStation),
        title: `${st.name} (${activeMpio.name})`,
        zIndexOffset: isSelectedStation ? 1000 : 500,
      });

      pin.bindPopup(`
        <div class="reg-popup">
          <span class="reg-popup-tag">${isSelectedStation ? '✓ PUESTO SELECCIONADO' : 'PUESTO DE VOTACIÓN'}</span>
          <strong>${st.name}</strong>
          <p>
            <strong>Ubicación:</strong> ${activeMpio.name}, ${dept.name}<br/>
            <strong>Dirección:</strong> ${st.address}<br/>
            <strong>Mesas habilitadas:</strong> ${st.tablesCount} mesas · Censo sintético: ${st.potentialVoters.toLocaleString('es-CO')}
          </p>
          <a href="#vote-panel" class="reg-popup-btn">🗳️ Votar y correr sistema aquí →</a>
        </div>
      `);

      pin.on('click', () => {
        const sel = selectDepartmentAndMunicipality(dept.code, activeMpio.code, st.stationCode);
        onSelectTerritory(sel.department.code, sel.municipality.code, sel.station.stationCode);
        renderActiveDepartmentMarkers();
      });

      activeDepartmentLayerGroup.addLayer(pin);
      if (isSelectedStation && map.getZoom() >= 9) {
        pin.openPopup();
      }
    }
  }

  renderClustersAndFeaturedPins();
  buildAll1122MunicipalitiesLayer();
  renderActiveDepartmentMarkers();

  // Floating bar buttons
  const btnToggle1122 = container.querySelector<HTMLButtonElement>('#btn-map-toggle-1122')!;
  const btnViewColombia = container.querySelector<HTMLButtonElement>('#btn-map-view-colombia')!;
  const btnViewWorld = container.querySelector<HTMLButtonElement>('#btn-map-view-world')!;

  btnToggle1122.addEventListener('click', () => {
    showAll1122Dots = !showAll1122Dots;
    btnToggle1122.classList.toggle('active', showAll1122Dots);
    if (showAll1122Dots) {
      all1122LayerGroup.addTo(map);
      map.flyTo([4.65, -74.1], 6, { duration: 0.8 });
    } else {
      map.removeLayer(all1122LayerGroup);
    }
  });

  btnViewColombia.addEventListener('click', () => {
    btnViewColombia.classList.add('active');
    btnViewWorld.classList.remove('active');
    map.flyTo([8.35, -72.8], 5, { duration: 0.85 });
  });

  btnViewWorld.addEventListener('click', () => {
    btnViewWorld.classList.add('active');
    btnViewColombia.classList.remove('active');
    map.flyTo([18.0, -42.0], 3, { duration: 0.9 });
  });

  // Ensure Leaflet recalculates tile container size when workspace becomes visible
  setTimeout(() => {
    map.invalidateSize();
  }, 200);

  return {
    refreshSelection: (flyToTarget = true) => {
      map.invalidateSize();
      renderActiveDepartmentMarkers();
      if (flyToTarget) {
        const { departmentCode, municipalityCode, stationCode } = activeDivipolaCodes();
        const stations = getVotingStationsForMunicipality(departmentCode, municipalityCode);
        const st = stations.find((s) => s.stationCode === stationCode) ?? stations[0];
        if (st) {
          map.flyTo([st.lat, st.lon], Math.max(map.getZoom(), 11), {
            duration: 0.85,
          });
        }
      }
    },
    resetWorldColombiaView: () => {
      map.invalidateSize();
      map.flyTo([8.35, -72.8], 5, { duration: 0.8 });
      renderActiveDepartmentMarkers();
    },
  };
}
