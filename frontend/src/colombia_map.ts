import {
  activeDivipolaCodes,
  allDepartments,
  type DepartmentEntry,
  getDepartmentByCode,
  getMunicipalityByCode,
  type MunicipalityEntry,
  selectDepartmentAndMunicipality,
} from './territories';

export type MapFilterMode = 'all' | 'capitals' | 'active_department';

type ProjectedPoint = {
  x: number;
  y: number;
  isInset: boolean;
  dept: DepartmentEntry;
  mpio: MunicipalityEntry;
};

// Geographic bounding box for continental Colombia
const LON_MIN = -79.25;
const LON_MAX = -66.65;
const LAT_MIN = -4.45;
const LAT_MAX = 12.65;

const SVG_WIDTH = 860;
const SVG_HEIGHT = 960;
const PAD_LEFT = 55;
const PAD_RIGHT = 45;
const PAD_TOP = 55;
const PAD_BOTTOM = 55;

// Accurate continental silhouette outline of Colombia (lon, lat vertices)
const COLOMBIA_OUTLINE_COORDS: Array<[number, number]> = [
  [-71.65, 12.45], // Punta Gallinas (La Guajira)
  [-71.15, 11.85],
  [-72.25, 11.75],
  [-72.92, 11.55], // Riohacha
  [-73.55, 11.28],
  [-74.22, 11.25], // Santa Marta
  [-74.85, 11.05], // Barranquilla
  [-75.52, 10.42], // Cartagena
  [-75.68, 9.42],  // Golfo de Morrosquillo
  [-76.42, 8.85],  // Urabá / Arboletes
  [-76.75, 7.88],  // Turbo / Apartadó
  [-77.18, 8.15],  // Acandí / Darién
  [-77.88, 7.22],  // Juradó (Chocó)
  [-77.45, 6.22],  // Bahía Solano
  [-77.35, 5.52],  // Nuquí
  [-77.38, 4.25],  // Bajo Baudó
  [-77.08, 3.88],  // Buenaventura
  [-77.85, 2.95],  // Guapi
  [-78.82, 1.82],  // Tumaco (Nariño)
  [-78.95, 1.42],  // Frontera Ecuador costa
  [-77.68, 0.82],  // Ipiales
  [-76.85, 0.25],  // Putumayo frontera
  [-75.25, -0.12], // Puerto Leguízamo
  [-73.85, -1.25], // Río Putumayo
  [-71.95, -2.15], // Amazonas norte
  [-70.12, -3.15], // Tarapacá
  [-69.95, -4.22], // Leticia (extremo sur Amazonas)
  [-69.55, -1.55], // La Pedrera / Apaporis
  [-69.85, 0.15],  // Vaupés / Mitú
  [-69.15, 1.18],  // frontera Brasil
  [-67.08, 1.22],  // Piedra del Cocuy (Guainía)
  [-67.45, 2.55],
  [-67.68, 3.88],  // Inírida
  [-67.82, 5.25],  // Vichada Orinoco
  [-67.48, 6.19],  // Puerto Carreño (Vichada)
  [-69.25, 6.12],  // Río Meta / Cravo Norte
  [-70.73, 7.08],  // Arauca
  [-72.05, 7.02],  // Saravena / Cubará
  [-72.48, 7.89],  // Cúcuta
  [-72.78, 8.65],  // Catatumbo
  [-73.35, 9.55],  // Serranía del Perijá
  [-72.85, 10.65], // Fonseca / Maicao
  [-71.98, 11.45],
  [-71.65, 12.45],
];

export function projectCoord(
  lon: number,
  lat: number,
  deptCode: string,
): { x: number; y: number; isInset: boolean } {
  // Archipiélago de San Andrés, Providencia y Santa Catalina (dept 88) -> Inset box top-left
  if (deptCode === '88' || lon < -80.0) {
    const insetX = 118 + (lon - -81.72) * 160;
    const insetY = 128 - (lat - 12.55) * 95;
    return {
      x: Math.max(55, Math.min(205, Number(insetX.toFixed(1)))),
      y: Math.max(62, Math.min(172, Number(insetY.toFixed(1)))),
      isInset: true,
    };
  }

  const usableW = SVG_WIDTH - PAD_LEFT - PAD_RIGHT;
  const usableH = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const normX = (lon - LON_MIN) / (LON_MAX - LON_MIN);
  const normY = (LAT_MAX - lat) / (LAT_MAX - LAT_MIN);

  const x = PAD_LEFT + normX * usableW;
  const y = PAD_TOP + normY * usableH;

  return {
    x: Number(x.toFixed(1)),
    y: Number(y.toFixed(1)),
    isInset: false,
  };
}

function buildOutlinePath(): string {
  return COLOMBIA_OUTLINE_COORDS.map(([lon, lat], idx) => {
    const { x, y } = projectCoord(lon, lat, '00');
    return `${idx === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ') + ' Z';
}

export function initInteractiveColombiaMap(
  container: HTMLElement,
  onSelectTerritory: (deptCode: string, mpioCode: string) => void,
): {
  refreshSelection: () => void;
} {
  let filterMode: MapFilterMode = 'all';
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  // Pre-project all 1,122 municipalities once for fast 60fps interaction
  const allPoints: ProjectedPoint[] = [];
  const capitalPointsByDept = new Map<string, ProjectedPoint>();

  for (const dept of allDepartments) {
    for (const mpio of dept.municipalities) {
      const { x, y, isInset } = projectCoord(mpio.lon, mpio.lat, dept.code);
      const pt: ProjectedPoint = { x, y, isInset, dept, mpio };
      allPoints.push(pt);
      if (mpio.is_capital || !capitalPointsByDept.has(dept.code)) {
        capitalPointsByDept.set(dept.code, pt);
      }
    }
  }

  const outlinePathD = buildOutlinePath();

  // Graticule lines
  const latLines = [12, 8, 4, 0, -4].map((lat) => {
    const p1 = projectCoord(LON_MIN, lat, '00');
    const p2 = projectCoord(LON_MAX, lat, '00');
    const label = lat > 0 ? `${lat}°N` : lat < 0 ? `${Math.abs(lat)}°S` : '0° Ecuador';
    return `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" class="map-grid-line" />
            <text x="${p2.x - 6}" y="${p2.y - 5}" class="map-grid-label" text-anchor="end">${label}</text>`;
  });

  const lonLines = [-78, -74, -70].map((lon) => {
    const p1 = projectCoord(lon, LAT_MAX, '00');
    const p2 = projectCoord(lon, LAT_MIN, '00');
    return `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" class="map-grid-line" />
            <text x="${p1.x + 4}" y="${p1.y + 12}" class="map-grid-label">${Math.abs(lon)}°W</text>`;
  });

  container.innerHTML = `
    <div class="colombia-map-layout">
      <!-- COLUMNA IZQUIERDA: LIENZO INTERACTIVO SVG CON LOS 1,122 PUNTOS -->
      <div class="colombia-map-stage-wrap">
        <div class="colombia-map-toolbar" role="toolbar" aria-label="Controles del mapa interactivo de Colombia">
          <div class="map-mode-group">
            <button type="button" class="map-mode-btn active" data-map-mode="all">
              <span>●</span> Todos los puntos (1,122 ciudades + 33 dptos)
            </button>
            <button type="button" class="map-mode-btn" data-map-mode="capitals">
              <span>★</span> Solo 33 Capitales
            </button>
            <button type="button" class="map-mode-btn" data-map-mode="active_department">
              <span>⌖</span> Municipios del Dpto Activo
            </button>
          </div>
          <div class="map-zoom-group">
            <button type="button" class="map-ctrl-btn" id="map-zoom-in" title="Acercar mapa" aria-label="Acercar mapa">+</button>
            <button type="button" class="map-ctrl-btn" id="map-zoom-out" title="Alejar mapa" aria-label="Alejar mapa">−</button>
            <button type="button" class="map-ctrl-btn" id="map-focus-dept" title="Enfocar departamento seleccionado">Enfocar Dpto</button>
            <button type="button" class="map-ctrl-btn" id="map-reset-view" title="Restablecer vista nacional de Colombia">Vista Nacional</button>
          </div>
        </div>

        <div class="colombia-svg-viewport" id="colombia-svg-viewport">
          <svg
            id="colombia-interactive-svg"
            viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}"
            role="img"
            aria-label="Mapa interactivo de Colombia con 32 departamentos, Bogotá D.C. y 1,122 municipios"
          >
            <defs>
              <radialGradient id="colombiaBgGrad" cx="50%" cy="45%" r="65%">
                <stop offset="0%" stop-color="#1d3c2e" />
                <stop offset="100%" stop-color="#0f231a" />
              </radialGradient>
              <linearGradient id="landFillGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#234937" stop-opacity="0.88" />
                <stop offset="100%" stop-color="#173326" stop-opacity="0.94" />
              </linearGradient>
              <filter id="glowFilter" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="3.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <!-- Fondo oceánico/cartográfico -->
            <rect x="0" y="0" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="url(#colombiaBgGrad)" />

            <g id="map-pan-zoom-group">
              <!-- Cuadrícula geográfica -->
              <g class="map-graticule">
                ${latLines.join('')}
                ${lonLines.join('')}
              </g>

              <!-- Etiquetas marítimas y fronterizas -->
              <text x="275" y="95" class="map-sea-label">MAR CARIBE</text>
              <text x="95" y="470" class="map-sea-label">OCÉANO PACÍFICO</text>
              <text x="690" y="290" class="map-border-label">VENEZUELA</text>
              <text x="710" y="670" class="map-border-label">BRASIL</text>
              <text x="415" y="835" class="map-border-label">PERÚ</text>
              <text x="155" y="725" class="map-border-label">ECUADOR</text>

              <!-- Silueta continental de Colombia -->
              <path d="${outlinePathD}" class="colombia-land-silhouette" fill="url(#landFillGrad)" />

              <!-- Recuadro Insular: Archipiélago de San Andrés, Providencia y Santa Catalina (88) -->
              <g class="san-andres-inset">
                <rect x="42" y="48" width="185" height="135" rx="10" class="inset-box" />
                <text x="54" y="68" class="inset-title">ARCHIPIÉLAGO SAN ANDRÉS (88)</text>
                <text x="54" y="82" class="inset-subtitle">San Andrés (88001) · Providencia (88564)</text>
              </g>

              <!-- Líneas de conexión departamental (Capital -> Municipios del departamento activo) -->
              <g id="map-dept-spokes"></g>

              <!-- Capa de los 1,122 puntos de municipios y ciudades -->
              <g id="map-municipalities-layer"></g>

              <!-- Capa de etiquetas de capitales y ciudad activa -->
              <g id="map-labels-layer"></g>

              <!-- Marcador pulsante del municipio/ciudad actualmente seleccionado -->
              <g id="map-active-marker"></g>
            </g>
          </svg>

          <!-- Tooltip flotante al pasar el cursor sobre cualquier punto -->
          <div id="map-hover-tooltip" class="map-hover-tooltip" hidden></div>

          <!-- Leyenda inferior del mapa -->
          <div class="map-legend-bar">
            <span><i class="legend-dot legend-dot-active"></i> Territorio seleccionado</span>
            <span><i class="legend-dot legend-dot-capital"></i> Capital departamental / D.C. (33)</span>
            <span><i class="legend-dot legend-dot-dept-mpio"></i> Municipios del dpto activo</span>
            <span><i class="legend-dot legend-dot-mpio"></i> Otros municipios de Colombia (1,122 total)</span>
          </div>
        </div>
      </div>

      <!-- COLUMNA DERECHA: FICHA INTERACTIVA DEL PUNTO SELECCIONADO Y ACCESO RÁPIDO A LOS 33 DEPARTAMENTOS -->
      <div class="colombia-map-sidepanel">
        <div id="map-selected-card" class="map-selected-card" aria-live="polite"></div>

        <div class="map-dept-directory">
          <div class="map-dept-directory-head">
            <span class="eyebrow">EXPLORADOR DIRECTO · 33 ENTIDADES TERRITORIALES</span>
            <small id="map-dept-counter">Haz clic en cualquier punto del mapa o en un departamento:</small>
          </div>
          <div id="map-all-depts-list" class="map-all-depts-list" role="list"></div>
        </div>

        <div class="map-mpio-directory">
          <div class="map-dept-directory-head">
            <span class="eyebrow" id="map-mpio-list-title">CIUDADES Y MUNICIPIOS DEL DEPARTAMENTO</span>
            <input id="map-mpio-quick-filter" type="search" placeholder="Filtrar ciudad/municipio en este dpto…" autocomplete="off" />
          </div>
          <div id="map-dept-mpios-chips" class="map-dept-mpios-chips"></div>
        </div>
      </div>
    </div>
  `;

  const svgEl = container.querySelector<SVGSVGElement>('#colombia-interactive-svg')!;
  const panZoomGroup = container.querySelector<SVGGElement>('#map-pan-zoom-group')!;
  const spokesLayer = container.querySelector<SVGGElement>('#map-dept-spokes')!;
  const mpiosLayer = container.querySelector<SVGGElement>('#map-municipalities-layer')!;
  const labelsLayer = container.querySelector<SVGGElement>('#map-labels-layer')!;
  const activeMarkerLayer = container.querySelector<SVGGElement>('#map-active-marker')!;
  const tooltipEl = container.querySelector<HTMLElement>('#map-hover-tooltip')!;
  const selectedCardEl = container.querySelector<HTMLElement>('#map-selected-card')!;
  const allDeptsListEl = container.querySelector<HTMLElement>('#map-all-depts-list')!;
  const deptMpiosChipsEl = container.querySelector<HTMLElement>('#map-dept-mpios-chips')!;
  const mpioQuickFilterInput = container.querySelector<HTMLInputElement>('#map-mpio-quick-filter')!;
  const mpioListTitleEl = container.querySelector<HTMLElement>('#map-mpio-list-title')!;

  // Build all 1,122 SVG circle elements once and attach data attributes for instant delegation
  const pointsHtml: string[] = [];
  for (let i = 0; i < allPoints.length; i++) {
    const pt = allPoints[i];
    const isCap = pt.mpio.is_capital;
    const r = isCap ? 4.8 : 2.5;
    pointsHtml.push(
      `<circle
        cx="${pt.x}"
        cy="${pt.y}"
        r="${r}"
        data-idx="${i}"
        data-dept="${pt.dept.code}"
        data-mpio="${pt.mpio.code}"
        data-capital="${isCap ? '1' : '0'}"
        class="map-point ${isCap ? 'map-point-capital' : 'map-point-mpio'}"
      />`,
    );
  }
  mpiosLayer.innerHTML = pointsHtml.join('');

  function applyTransform(): void {
    panZoomGroup.setAttribute(
      'transform',
      `translate(${panX.toFixed(1)}, ${panY.toFixed(1)}) scale(${zoom.toFixed(3)})`,
    );
  }

  function focusOnDepartment(deptCode: string): void {
    const deptPts = allPoints.filter((p) => p.dept.code === deptCode);
    if (deptPts.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of deptPts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const spanX = Math.max(65, maxX - minX + 70);
    const spanY = Math.max(65, maxY - minY + 70);

    const targetZoom = Math.min(3.4, Math.max(1.35, Math.min(SVG_WIDTH / spanX, SVG_HEIGHT / spanY) * 0.65));
    zoom = targetZoom;
    panX = SVG_WIDTH / 2 - cx * zoom;
    panY = SVG_HEIGHT / 2 - cy * zoom;
    applyTransform();
  }

  function resetNationalView(): void {
    zoom = 1;
    panX = 0;
    panY = 0;
    applyTransform();
  }

  function renderMapLayersAndSidepanel(): void {
    const { departmentCode, municipalityCode } = activeDivipolaCodes();
    const activeDept = getDepartmentByCode(departmentCode);
    const activeMpio = getMunicipalityByCode(municipalityCode);

    // 1. Update point visibility & classes across all 1,122 circles
    const circles = mpiosLayer.querySelectorAll<SVGCircleElement>('circle');
    circles.forEach((circle) => {
      const cDept = circle.dataset.dept!;
      const cMpio = circle.dataset.mpio!;
      const isCap = circle.dataset.capital === '1';
      const isSameDept = cDept === departmentCode;
      const isSelected = cMpio === municipalityCode;

      let visible = true;
      if (filterMode === 'capitals') {
        visible = isCap || isSelected;
      } else if (filterMode === 'active_department') {
        visible = isSameDept || isCap;
      }

      circle.style.display = visible ? '' : 'none';
      circle.classList.toggle('is-active-dept', isSameDept);
      circle.classList.toggle('is-selected-mpio', isSelected);

      if (isSelected) {
        circle.setAttribute('r', '6.8');
      } else if (isCap) {
        circle.setAttribute('r', isSameDept ? '5.4' : '4.5');
      } else if (isSameDept) {
        circle.setAttribute('r', '3.4');
      } else {
        circle.setAttribute('r', '2.2');
      }
    });

    // 2. Draw constellation spokes from active department's capital to all its municipalities
    const capPt = capitalPointsByDept.get(departmentCode);
    const deptPts = allPoints.filter((p) => p.dept.code === departmentCode);
    if (capPt && deptPts.length > 1) {
      spokesLayer.innerHTML = deptPts
        .map(
          (pt) =>
            `<line x1="${capPt.x}" y1="${capPt.y}" x2="${pt.x}" y2="${pt.y}" class="map-spoke-line" />`,
        )
        .join('');
    } else {
      spokesLayer.innerHTML = '';
    }

    // 3. Render capital labels + active department municipality labels
    const labelsHtml: string[] = [];
    for (const [dCode, pt] of capitalPointsByDept.entries()) {
      const isActDept = dCode === departmentCode;
      if (filterMode === 'active_department' && !isActDept) continue;
      labelsHtml.push(
        `<text
          x="${pt.x + 7}"
          y="${pt.y + 3}"
          class="map-cap-label ${isActDept ? 'map-cap-label-active' : ''}"
          data-dept="${dCode}"
          data-mpio="${pt.mpio.code}"
        >${pt.mpio.name}</text>`,
      );
    }
    labelsLayer.innerHTML = labelsHtml.join('');

    // 4. Render pulsing target marker on the selected city/municipality
    const activePt =
      allPoints.find((p) => p.mpio.code === municipalityCode) ??
      capitalPointsByDept.get(departmentCode);
    if (activePt) {
      activeMarkerLayer.innerHTML = `
        <circle cx="${activePt.x}" cy="${activePt.y}" r="15" class="map-pulse-outer" />
        <circle cx="${activePt.x}" cy="${activePt.y}" r="9.5" class="map-pulse-inner" />
        <circle cx="${activePt.x}" cy="${activePt.y}" r="4.8" class="map-pulse-core" filter="url(#glowFilter)" />
        <g transform="translate(${Math.min(SVG_WIDTH - 220, Math.max(16, activePt.x + 12))}, ${Math.max(28, activePt.y - 14)})">
          <rect x="0" y="-16" width="205" height="24" rx="6" class="map-active-callout-bg" />
          <text x="8" y="-1" class="map-active-callout-text">📍 [${activeMpio.code}] ${activeMpio.name.slice(0, 19)}</text>
        </g>
      `;
    }

    // 5. Update Selected Territory Card on the right sidepanel
    selectedCardEl.innerHTML = `
      <div class="map-selected-header">
        <span class="tag tag-sand">PUNTO SELECCIONADO EN EL MAPA</span>
        <span class="map-coord-pill">${activeMpio.lat.toFixed(3)}°N, ${activeMpio.lon.toFixed(3)}°W</span>
      </div>
      <h3>${activeMpio.name}</h3>
      <p class="map-selected-sub">
        <strong>Departamento / Entidad:</strong> [${activeDept.code}] ${activeDept.name}<br/>
        <strong>Código DANE DIVIPOLA:</strong> <code>${activeMpio.code}</code> ·
        <strong>Categoría:</strong> ${activeMpio.category}${activeMpio.is_capital ? ' (Capital)' : ''}<br/>
        <strong>Régimen:</strong> ${activeDept.regime} ·
        <strong>Municipios en ${activeDept.name}:</strong> ${activeDept.municipalities.length}
      </p>
      <div class="button-row">
        <a href="#vote-panel" class="button map-cta-link">Ir a Votar en ${activeMpio.name} →</a>
        <a href="#admin-panel" class="button button-quiet map-cta-link">Configurar Proceso aquí</a>
      </div>
    `;

    // 6. Render all 33 Departments list
    allDeptsListEl.innerHTML = allDepartments
      .map((d) => {
        const selected = d.code === departmentCode;
        return `<button
          type="button"
          class="map-dept-item ${selected ? 'selected' : ''}"
          data-select-dept="${d.code}"
          aria-pressed="${selected}"
        >
          <span class="map-dept-code">${d.code}</span>
          <span class="map-dept-name">${d.name}</span>
          <span class="map-dept-count">${d.municipalities.length}</span>
        </button>`;
      })
      .join('');

    allDeptsListEl.querySelectorAll<HTMLButtonElement>('[data-select-dept]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dCode = btn.dataset.selectDept!;
        const { department, municipality } = selectDepartmentAndMunicipality(dCode);
        onSelectTerritory(department.code, municipality.code);
        if (filterMode === 'active_department') {
          focusOnDepartment(department.code);
        }
        renderMapLayersAndSidepanel();
      });
    });

    // 7. Render Municipalities chips for the active department
    renderDepartmentMunicipalityChips();
  }

  function renderDepartmentMunicipalityChips(): void {
    const { departmentCode, municipalityCode } = activeDivipolaCodes();
    const activeDept = getDepartmentByCode(departmentCode);
    const query = mpioQuickFilterInput.value.trim().toUpperCase();

    mpioListTitleEl.textContent = `CIUDADES Y MUNICIPIOS DE ${activeDept.name} (${activeDept.municipalities.length})`;

    const filtered = activeDept.municipalities.filter(
      (m) =>
        !query ||
        m.normalized.includes(query) ||
        m.name.toUpperCase().includes(query) ||
        m.code.includes(query),
    );

    deptMpiosChipsEl.innerHTML = filtered
      .map((m) => {
        const isSel = m.code === municipalityCode;
        return `<button
          type="button"
          class="map-mpio-chip ${isSel ? 'selected' : ''}"
          data-chip-dept="${activeDept.code}"
          data-chip-mpio="${m.code}"
        >
          <span>${m.code}</span> ${m.name}${m.is_capital ? ' ★' : ''}
        </button>`;
      })
      .join('');

    deptMpiosChipsEl.querySelectorAll<HTMLButtonElement>('[data-chip-mpio]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dCode = btn.dataset.chipDept!;
        const mCode = btn.dataset.chipMpio!;
        selectDepartmentAndMunicipality(dCode, mCode);
        onSelectTerritory(dCode, mCode);
        renderMapLayersAndSidepanel();
      });
    });
  }

  mpioQuickFilterInput.addEventListener('input', () => {
    renderDepartmentMunicipalityChips();
  });

  // Click delegation on SVG points & labels
  svgEl.addEventListener('click', (ev) => {
    const target = ev.target as Element | null;
    if (!target) return;
    const deptCode = target.getAttribute('data-dept');
    const mpioCode = target.getAttribute('data-mpio');
    if (deptCode && mpioCode) {
      selectDepartmentAndMunicipality(deptCode, mpioCode);
      onSelectTerritory(deptCode, mpioCode);
      renderMapLayersAndSidepanel();
    }
  });

  // Hover tooltip on SVG points
  svgEl.addEventListener('mousemove', (ev) => {
    const target = ev.target as Element | null;
    if (!target || !target.hasAttribute('data-idx')) {
      tooltipEl.hidden = true;
      return;
    }
    const idx = Number(target.getAttribute('data-idx'));
    const pt = allPoints[idx];
    if (!pt) {
      tooltipEl.hidden = true;
      return;
    }

    const viewportRect = svgEl.getBoundingClientRect();
    const relX = ev.clientX - viewportRect.left;
    const relY = ev.clientY - viewportRect.top;

    tooltipEl.hidden = false;
    tooltipEl.style.left = `${Math.min(viewportRect.width - 235, Math.max(10, relX + 14))}px`;
    tooltipEl.style.top = `${Math.max(10, relY - 68)}px`;
    tooltipEl.innerHTML = `
      <div class="tooltip-badge">${pt.mpio.is_capital ? '★ CAPITAL DEPARTAMENTAL' : pt.mpio.category.toUpperCase()}</div>
      <strong>[${pt.mpio.code}] ${pt.mpio.name}</strong>
      <span>Departamento: ${pt.dept.name} (${pt.dept.code})</span>
      <small>Lat ${pt.mpio.lat.toFixed(3)}° · Lon ${pt.mpio.lon.toFixed(3)}° — Clic para elegir</small>
    `;
  });

  svgEl.addEventListener('mouseleave', () => {
    tooltipEl.hidden = true;
  });

  // Drag-to-pan support when zoomed in
  svgEl.addEventListener('mousedown', (ev) => {
    if ((ev.target as Element)?.hasAttribute('data-mpio')) return;
    isDragging = true;
    dragStartX = ev.clientX - panX;
    dragStartY = ev.clientY - panY;
  });

  window.addEventListener('mousemove', (ev) => {
    if (!isDragging) return;
    panX = ev.clientX - dragStartX;
    panY = ev.clientY - dragStartY;
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Toolbar mode buttons
  container.querySelectorAll<HTMLButtonElement>('[data-map-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterMode = btn.dataset.mapMode as MapFilterMode;
      container.querySelectorAll<HTMLButtonElement>('[data-map-mode]').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      if (filterMode === 'active_department') {
        focusOnDepartment(activeDivipolaCodes().departmentCode);
      } else if (filterMode === 'capitals') {
        resetNationalView();
      }
      renderMapLayersAndSidepanel();
    });
  });

  container.querySelector<HTMLButtonElement>('#map-zoom-in')!.addEventListener('click', () => {
    zoom = Math.min(4.0, zoom * 1.3);
    panX = SVG_WIDTH / 2 - (SVG_WIDTH / 2 - panX) * 1.3;
    panY = SVG_HEIGHT / 2 - (SVG_HEIGHT / 2 - panY) * 1.3;
    applyTransform();
  });

  container.querySelector<HTMLButtonElement>('#map-zoom-out')!.addEventListener('click', () => {
    zoom = Math.max(1.0, zoom / 1.3);
    if (zoom === 1) {
      panX = 0;
      panY = 0;
    } else {
      panX = SVG_WIDTH / 2 - (SVG_WIDTH / 2 - panX) / 1.3;
      panY = SVG_HEIGHT / 2 - (SVG_HEIGHT / 2 - panY) / 1.3;
    }
    applyTransform();
  });

  container.querySelector<HTMLButtonElement>('#map-focus-dept')!.addEventListener('click', () => {
    focusOnDepartment(activeDivipolaCodes().departmentCode);
  });

  container.querySelector<HTMLButtonElement>('#map-reset-view')!.addEventListener('click', () => {
    resetNationalView();
  });

  renderMapLayersAndSidepanel();

  return {
    refreshSelection: renderMapLayersAndSidepanel,
  };
}
