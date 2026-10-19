import {
  activeContractId,
  activeDivipolaCodes,
  allDepartments,
  allTerritorialEntities,
  divipolaMetadata,
  getDepartmentByCode,
  getMunicipalitiesForDepartment,
  getMunicipalityByCode,
  getVotingStationsForMunicipality,
  internationalCountries,
  searchMunicipalities,
  selectDepartmentAndMunicipality,
  selectTerritory,
  territories,
  territoryInfo,
  votingMechanismTemplates,
} from './territories';
import {
  type AuthenticatedSession,
  grantBiometricConsentStep3,
  issueSessionStep4,
  logoutSession,
  revokeBiometricConsentStep3,
  startLoginStep1,
  verifyAdminTotp,
  verifyFacialStep3,
  verifyFallbackStep3,
  verifyOtpStep2,
} from './identity';
import { initInteractiveColombiaMap } from './colombia_map';

type LocalProcess = {
  id: string;
  title: string;
  question: string;
  description: string;
  templateId: string;
  templateName: string;
  category: string;
  deliberative: boolean;
  departmentCode: string;
  departmentName: string;
  municipalityCode: string;
  municipalityName: string;
  scope: string;
  state: 'draft' | 'open' | 'closed' | 'cancelled';
  options: string[];
  blankVoteEnabled: boolean;
  maxSelections: number;
  censusSize: number;
  thresholdPct: number;
  majorityRule: string;
  tallies: Record<string, number>;
  voterMarkers: Set<string>;
  proposals: Array<{ title: string; summary: string; author: string }>;
  receipts: Array<{ receiptId: string; txHash?: string; confirmed: boolean; timestamp: string }>;
};

const demoAdmins = [
  'Coordinación electoral (analogía didáctica: Personería)',
  'Observación de control (analogía didáctica: Contraloría)',
  'Observación deliberativa (analogía didáctica: Concejo)',
  'Observación registral (analogía didáctica: Registraduría)',
  'Administración técnica sintética',
  'Auditoría independiente sintética',
  'Observación de resultados sintética',
  'Gestión de incidentes sintética',
];

const processesStore: LocalProcess[] = [
  {
    id: 'proc-medellin-05001',
    title: 'Consulta Popular Sintética — Priorización Urbana Medellín',
    question: '¿Cuál proyecto sintético prioriza para el laboratorio cívico de Medellín (05001)?',
    description:
      'Escenario demostrativo no vinculante con cuentas ficticias en Stellar Testnet. No ofrece voto secreto en cadena.',
    templateId: 'consulta_popular',
    templateName: 'Consulta Popular (Nacional, Departamental, Distrital o Municipal)',
    category: 'B_participacion_ciudadana',
    deliberative: false,
    departmentCode: '05',
    departmentName: 'ANTIOQUIA',
    municipalityCode: '05001',
    municipalityName: 'MEDELLÍN',
    scope: 'municipal',
    state: 'open',
    options: ['CORREDOR_VERDE_ABURRA', 'PARQUES_EDUCATIVOS_BARRIALES', 'VOTO_EN_BLANCO'],
    blankVoteEnabled: true,
    maxSelections: 1,
    censusSize: 50,
    thresholdPct: 33.33,
    majorityRule: 'mitad_mas_uno_con_tercera_parte_censo',
    tallies: {
      CORREDOR_VERDE_ABURRA: 0,
      PARQUES_EDUCATIVOS_BARRIALES: 0,
      VOTO_EN_BLANCO: 0,
    },
    voterMarkers: new Set(),
    proposals: [],
    receipts: [],
  },
  {
    id: 'proc-cabildo-11001',
    title: 'Cabildo Abierto Simulado — Movilidad Sostenible Bogotá D.C.',
    question: '¿Qué ponencias comunitarias se inscriben y priorizan para respuesta motivada?',
    description:
      'El cabildo abierto NO se reduce a una papeleta digital ni elige candidatos: articula inscripción de ponencias, deliberación pública y respuesta motivada.',
    templateId: 'cabildo_abierto',
    templateName: 'Cabildo Abierto (Flujo Deliberativo + Registro de Ponencias)',
    category: 'B_participacion_ciudadana',
    deliberative: true,
    departmentCode: '11',
    departmentName: 'BOGOTÁ, D.C.',
    municipalityCode: '11001',
    municipalityName: 'BOGOTÁ, D.C.',
    scope: 'distrital',
    state: 'open',
    options: ['PONENCIA_PEATONAL_SEPTIMA', 'PONENCIA_CICLORRUTA_SUR'],
    blankVoteEnabled: false,
    maxSelections: 1,
    censusSize: 100,
    thresholdPct: 0.5,
    majorityRule: 'deliberacion_y_respuesta_motivada',
    tallies: {
      PONENCIA_PEATONAL_SEPTIMA: 0,
      PONENCIA_CICLORRUTA_SUR: 0,
    },
    voterMarkers: new Set(),
    proposals: [
      {
        title: 'Ponencia 01: Red Peatonal Accesible',
        summary: 'Solicitud de ampliación de cruces seguros y señalización táctil.',
        author: 'Comité Cívico Sintético Chapinero',
      },
    ],
    receipts: [],
  },
];

let activeProcessId = processesStore[0].id;
let currentSession: AuthenticatedSession | null = null;
let activeChallengeId = '';
let activeAuthStep: 1 | 2 | 3 | 4 = 1;
let biometricConsentChecked = false;
let step3Completed = false;
let connectedAddress: string | undefined;

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Falta #app en index.html');

root.innerHTML = `
  <!-- BARRA OFICIAL GOV.CO + TRICOLOR REPÚBLICA DE COLOMBIA -->
  <div class="govco-top-strip" role="banner" aria-label=" Cabecera institucional GOV.CO">
    <div class="govco-top-inner">
      <div class="govco-logo-group">
        <span class="govco-badge">GOV.CO</span>
        <span class="govco-text">Portal de Innovación Democrática · Laboratorio Cívico Verificable en Stellar</span>
      </div>
      <div class="govco-right-pills">
        <span class="govco-pill">🇨🇴 República de Colombia · 32 Dptos + Bogotá D.C. + Exterior</span>
        <span class="govco-pill">Ley 1581/2012 · Ley 1757/2015</span>
      </div>
    </div>
    <div class="colombia-tricolor-bar" aria-hidden="true">
      <span class="tricolor-yellow"></span>
      <span class="tricolor-blue"></span>
      <span class="tricolor-red"></span>
    </div>
  </div>

  <header class="topbar topbar-institutional">
    <div class="topbar-brand-cluster">
      <div class="topbar-brand-group">
        <a class="brand" href="#territory-panel" aria-label="Consensus inicio">
          <span class="brand-mark">C</span>
          <span>CONSENSUS COLOMBIA<small>REGISTRADURÍA DIGITAL · SIMULADOR STELLAR SOROBAN</small></span>
        </a>
        <div class="elecciones-badge">
          <span class="elecciones-year">2026</span>
          <span class="elecciones-title">ELECCIONES</span>
          <span class="elecciones-sub">COLOMBIA Y EL MUNDO</span>
        </div>
      </div>
      <nav class="institutional-nav-strip" aria-label="Accesos rápidos del sistema electoral">
        <a class="inst-nav-pill" href="#processes-panel">Capacitación Electoral - SICE</a>
        <a class="inst-nav-pill" href="#admin-panel">Registro de comités</a>
        <a class="inst-nav-pill inst-nav-pill-active" href="#territory-panel">Consultar aquí · ¿Dónde votar?</a>
        <a class="inst-nav-pill" href="#vote-panel">Inscripción de ciudadanos</a>
        <a class="inst-nav-pill" href="#admin-panel">Inscripción de candidatos</a>
        <a class="inst-nav-pill" href="#evidence-panel">Jurados de votación</a>
      </nav>
    </div>
    <div class="topbar-session-bar">
      <div class="topbar-session-left">
        <span class="network-pill"><i></i> STELLAR SOROBAN TESTNET</span>
        <span id="session-badge" class="tag tag-outline">Autenticación multifactor pendiente</span>
      </div>
      <div class="topbar-right">
        <button id="connect" class="button button-dark" type="button">🔗 Conectar Billetera Freighter</button>
        <button id="logout-btn" class="button button-danger" type="button" hidden>Cerrar sesión segura</button>
      </div>
    </div>
  </header>

  <!-- PANTALLAS 1, 2 Y 3: PORTAL GUBERNAMENTAL DE IDENTIDAD DIGITAL Y VERIFICACIÓN EN 4 PASOS -->
  <section id="auth-gate" class="auth-gate-shell" aria-labelledby="auth-gate-title">
    <div class="gov-auth-portal">
      <!-- COLUMNA IZQUIERDA: IDENTIDAD INSTITUCIONAL DEL ESTADO COLOMBIANO -->
      <aside class="gov-auth-aside" aria-label="Información institucional de seguridad">
        <div class="gov-coat-header">
          <div class="gov-shield-circle" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="42" height="42" fill="none">
              <circle cx="32" cy="32" r="30" stroke="#FCD116" stroke-width="2.2" fill="rgba(255,255,255,0.06)"/>
              <path d="M32 10L49 18V31C49 43.2 41.7 51.8 32 55C22.3 51.8 15 43.2 15 31V18L32 10Z" fill="#003893" stroke="#FCD116" stroke-width="2"/>
              <path d="M16 24H48V32H16V24Z" fill="#FCD116" fill-opacity="0.88"/>
              <path d="M17 32H47V41C44.5 47 38.8 51.5 32 54C25.2 51.5 19.5 47 17 41V32Z" fill="#CE1126" fill-opacity="0.9"/>
              <circle cx="32" cy="20" r="3.2" fill="#FCD116"/>
            </svg>
          </div>
          <div>
            <span class="gov-aside-kicker">REPÚBLICA DE COLOMBIA · DEMO CÍVICO</span>
            <h2>Ventanilla Única de Identidad Electoral</h2>
          </div>
        </div>

        <p class="gov-aside-desc">
          Sistema de autenticación multifactor con validación de <strong>Google reCAPTCHA</strong> en servidor, código <strong>OTP criptográfico</strong> de un solo uso y verificación biométrica 1:1 <strong>FacePlugin SDK</strong> bajo la <strong>Ley Estatutaria 1581 de 2012</strong>.
        </p>

        <div class="gov-role-picker-title">1. Selecciona tu perfil institucional de prueba:</div>
        <div class="gov-role-cards" role="group" aria-label="Perfiles sintéticos disponibles">
          <button type="button" class="gov-role-card active" data-preset-email="participante.demo@consensus.local">
            <span class="gov-role-icon">🗳️</span>
            <div class="gov-role-info">
              <strong>Ciudadano Votante</strong>
              <small>participante.demo@consensus.local · Medellín (05001)</small>
            </div>
            <span class="gov-role-check">✓</span>
          </button>
          <button type="button" class="gov-role-card" data-preset-email="admin.demo@consensus.local">
            <span class="gov-role-icon">🏛️</span>
            <div class="gov-role-info">
              <strong>Delegado Electoral (Admin)</strong>
              <small>admin.demo@consensus.local · Apertura y Escrutinio</small>
            </div>
            <span class="gov-role-check">✓</span>
          </button>
          <button type="button" class="gov-role-card" data-preset-email="auditor.demo@consensus.local">
            <span class="gov-role-icon">🛡️</span>
            <div class="gov-role-info">
              <strong>Misión de Auditoría (MOE)</strong>
              <small>auditor.demo@consensus.local · Verificación Stellar</small>
            </div>
            <span class="gov-role-check">✓</span>
          </button>
        </div>

        <div class="gov-fast-access-card">
          <div class="gov-fast-access-copy">
            <strong>¿Deseas explorar el mapa y votar de inmediato?</strong>
            <small>Completa automáticamente los 4 pasos de seguridad con la cuenta seleccionada y abre el mapa interactivo de Colombia y el mundo.</small>
          </div>
          <button id="btn-fast-demo-login" class="gov-btn-gold-cta" type="button">
            🗺️ Entrar y Abrir Mapa "¿Dónde podrás votar?" →
          </button>
        </div>

        <ul class="gov-security-badges">
          <li><span>🔒</span> Cookie <code>HttpOnly</code> + <code>SameSite=Lax</code> (Cero secretos en localStorage)</li>
          <li><span>🧬</span> Biometría 1:1 efímera en RAM (0 segundos de retención en disco o S3)</li>
          <li><span>⛓️</span> Contrato Inteligente Rust/WASM en Stellar Soroban Testnet</li>
        </ul>
      </aside>

      <!-- COLUMNA DERECHA: ASISTENTE DE AUTENTICACIÓN EN 4 PASOS -->
      <div class="auth-card gov-auth-main">
        <div class="auth-card-header">
          <div>
            <div class="gov-header-pills">
              <span class="gov-badge-official">SEGURIDAD ELECTORAL NIVEL 4</span>
              <span class="gov-badge-law">LEY 1581 DE 2012 · HABEAS DATA</span>
            </div>
            <h1 id="auth-gate-title">Verificación de Identidad Digital en 4 Pasos</h1>
            <p class="muted">Completa el flujo de seguridad paso a paso. Entorno educativo y experimental con datos sintéticos; no reemplaza el censo oficial de la Registraduría Nacional.</p>
          </div>
          <div class="hero-stamp auth-stamp"><span>CO</span><strong>2026</strong><small>4 PASOS</small></div>
        </div>

        <!-- STEPPER INTERACTIVO DE 4 PASOS -->
        <ol class="auth-stepper gov-stepper" aria-label="Progreso de autenticación">
          <li id="step-ind-1" class="active">
            <div class="step-circle">01</div>
            <div class="step-text"><strong>Correo y reCAPTCHA</strong><small>Filtro antibots</small></div>
          </li>
          <li id="step-ind-2">
            <div class="step-circle">02</div>
            <div class="step-text"><strong>Código OTP</strong><small>Pin de 6 dígitos</small></div>
          </li>
          <li id="step-ind-3">
            <div class="step-circle">03</div>
            <div class="step-text"><strong>Biometría Facial</strong><small>FacePlugin 1:1</small></div>
          </li>
          <li id="step-ind-4">
            <div class="step-circle">04</div>
            <div class="step-text"><strong>Sesión Segura</strong><small>Credencial HttpOnly</small></div>
          </li>
        </ol>

        <div id="auth-alert" class="auth-alert gov-alert-banner" role="status" aria-live="polite">
          Paso 1 de 4: Verifica tu correo institucional y confirma la casilla de seguridad Google reCAPTCHA para recibir tu código OTP.
        </div>

        <!-- ==================== PASO 1: CORREO + GOOGLE RECAPTCHA ==================== -->
        <div id="auth-step-1" class="auth-step-pane">
          <div class="gov-step-card">
            <div class="gov-step-card-head">
              <span class="gov-step-number">PASO 01</span>
              <div>
                <h3>Identificación por Correo Electrónico y Protección Antibots</h3>
                <p>Normalización RFC 5322, límite de intentos por IP y verificación de token en servidor.</p>
              </div>
            </div>

            <div class="form-grid">
              <div>
                <label for="login-preset">Perfil autorizado del censo sintético</label>
                <select id="login-preset" class="gov-input">
                  <option value="participante.demo@consensus.local">Ciudadano Votante (participante.demo@consensus.local)</option>
                  <option value="admin.demo@consensus.local">Delegado Electoral / Admin (admin.demo@consensus.local)</option>
                  <option value="auditor.demo@consensus.local">Auditor Independiente MOE (auditor.demo@consensus.local)</option>
                </select>
              </div>
              <div>
                <label for="login-email">Correo electrónico registrado</label>
                <div class="gov-input-icon-wrap">
                  <span class="gov-input-icon">✉️</span>
                  <input id="login-email" class="gov-input gov-input-with-icon" type="email" value="participante.demo@consensus.local" autocomplete="username" required />
                </div>
              </div>
            </div>

            <!-- WIDGET VISUAL GOOGLE RECAPTCHA REALISTA -->
            <div class="recaptcha-section-grid">
              <div class="recaptcha-box" id="recaptcha-visual-box">
                <label class="recaptcha-check-label" for="recaptcha-visual-checkbox">
                  <input id="recaptcha-visual-checkbox" type="checkbox" checked />
                  <span class="recaptcha-custom-box" id="recaptcha-Checkmark"></span>
                  <span class="recaptcha-label-text">No soy un robot</span>
                </label>
                <div class="recaptcha-brand">
                  <svg viewBox="0 0 64 64" width="30" height="30" aria-hidden="true">
                    <path d="M32 8a24 24 0 0 1 21.8 14H44l8 10 8-10h-4.1A28 28 0 0 0 32 4C18.2 4 6.8 14 4.4 27.2l4 .8A24 24 0 0 1 32 8z" fill="#1c3aa9"/>
                    <path d="M55.6 36.8A24 24 0 0 1 32 56a24 24 0 0 1-21.8-14H20l-8-10-8 10h4.1A28 28 0 0 0 32 60c13.8 0 25.2-10 27.6-23.2l-4-.8z" fill="#4285f4"/>
                  </svg>
                  <strong>reCAPTCHA</strong>
                  <small>Privacidad · Condiciones</small>
                </div>
              </div>

              <div class="recaptcha-mode-selector">
                <label for="login-recaptcha">Modo de validación en servidor (Pruebas DevSecOps)</label>
                <select id="login-recaptcha" class="gov-input">
                  <option value="test-recaptcha-pass-consensus">✓ Token reCAPTCHA válido (Verificado por API Backend)</option>
                  <option value="invalid-bot-token">✕ Simular ataque de bot / Token inválido (Probar rechazo 400)</option>
                </select>
                <small class="recaptcha-micro-note">El navegador nunca decide por sí solo; el servidor verifica el token contra la política configurada.</small>
              </div>
            </div>

            <div class="gov-step-footer">
              <button id="btn-step1-submit" class="gov-btn-primary" type="button">
                Validar Correo y Enviar Código OTP de 6 Dígitos →
              </button>
            </div>
          </div>
        </div>

        <!-- ==================== PASO 2: CÓDIGO OTP POR CORREO ==================== -->
        <div id="auth-step-2" class="auth-step-pane" hidden>
          <div class="gov-step-card">
            <div class="gov-step-card-head">
              <span class="gov-step-number">PASO 02</span>
              <div>
                <h3>Verificación de Código OTP de Un Solo Uso (2FA Correo)</h3>
                <p>Código generado con CSPRNG criptográfico · Expiración: 5 minutos · Máximo 3 intentos.</p>
              </div>
            </div>

            <!-- BANDEJA DE CORREO INSTITUCIONAL SIMULADA -->
            <div class="gov-email-preview-card">
              <div class="gov-email-preview-header">
                <span class="gov-email-badge">📩 NOTIFICACIÓN ELECTRÓNICA · SANDBOX LOCAL</span>
                <span class="gov-otp-timer">⏱️ Expira en 05:00 min</span>
              </div>
              <div id="sandbox-otp-box" class="sandbox-box gov-sandbox-otp-content">
                Generando código OTP seguro...
              </div>
            </div>

            <!-- TECLADO VISUAL DE 6 DÍGITOS OTP -->
            <div class="gov-otp-input-section">
              <label for="login-otp">Ingresa o confirma los 6 dígitos de tu código de seguridad:</label>
              <div class="otp-visual-digits" id="otp-visual-digits" aria-hidden="true">
                <span class="otp-digit-box">-</span>
                <span class="otp-digit-box">-</span>
                <span class="otp-digit-box">-</span>
                <span class="otp-digit-box">-</span>
                <span class="otp-digit-box">-</span>
                <span class="otp-digit-box">-</span>
              </div>
              <input id="login-otp" class="gov-otp-raw-input" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code" />
              <small class="muted">Al verificar el código, este queda invalidado inmediatamente para impedir ataques de repetición (replay).</small>
            </div>

            <div class="gov-step-footer">
              <button id="btn-step2-verify" class="gov-btn-primary" type="button">
                Confirmar Código OTP y Pasar a Biometría →
              </button>
              <button id="btn-step2-resend" class="button-quiet gov-btn-secondary" type="button">
                🔄 Reenviar Código OTP (Enfriamiento 60s)
              </button>
            </div>
          </div>
        </div>

        <!-- ==================== PASO 3: RECONOCIMIENTO FACIAL 1:1 + LEY 1581 ==================== -->
        <div id="auth-step-3" class="auth-step-pane" hidden>
          <div class="gov-step-card">
            <div class="gov-step-card-head">
              <span class="gov-step-number">PASO 03</span>
              <div>
                <h3>Verificación Biométrica Facial 1:1 (FacePlugin SDK) o Contingencia</h3>
                <p>Protección de datos sensibles conforme a la Ley 1581 de 2012 · Comparación 1:1 efímera sin almacenamiento.</p>
              </div>
            </div>

            <!-- VISOR DE ESCÁNER BIOMÉTRICO + CONSENTIMIENTO LADO A LADO -->
            <div class="biometric-workstation-grid">
              <!-- VISOR DE CÁMARA / ESCÁNER FACIAL HUD -->
              <div class="biometric-scanner-card" id="biometric-scanner-card">
                <div class="scanner-topbar">
                  <span class="scanner-live-pill"><i class="scanner-dot"></i> FACEPLUGIN SDK · 1:1 ONNX</span>
                  <span class="scanner-ram-pill" id="scanner-status-label">RETENCIÓN: 0.0s RAM</span>
                </div>

                <div class="scanner-viewport" id="scanner-viewport">
                  <video id="biometric-webcam-video" class="scanner-video" autoplay playsinline muted hidden></video>

                  <!-- MALLA BIOMÉTRICA FACIAL SVG + RETÍCULA DE ESCANEO -->
                  <svg class="scanner-hud-svg" viewBox="0 0 320 260" aria-label="Visor de encuadre biométrico facial">
                    <defs>
                      <linearGradient id="scanLaserGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stop-color="#00e5ff" stop-opacity="0"/>
                        <stop offset="50%" stop-color="#fcd116" stop-opacity="0.95"/>
                        <stop offset="100%" stop-color="#00e5ff" stop-opacity="0"/>
                      </linearGradient>
                    </defs>
                    <!-- Brackets de esquina -->
                    <path d="M45 55 V30 H75" stroke="#FCD116" stroke-width="3" fill="none" stroke-linecap="round"/>
                    <path d="M275 55 V30 H245" stroke="#FCD116" stroke-width="3" fill="none" stroke-linecap="round"/>
                    <path d="M45 205 V230 H75" stroke="#FCD116" stroke-width="3" fill="none" stroke-linecap="round"/>
                    <path d="M275 205 V230 H245" stroke="#FCD116" stroke-width="3" fill="none" stroke-linecap="round"/>

                    <!-- Óvalo guía de rostro -->
                    <ellipse cx="160" cy="128" rx="68" ry="84" stroke="#00e5ff" stroke-width="1.6" stroke-dasharray="6 4" fill="rgba(0, 229, 255, 0.04)"/>

                    <!-- Malla geométrica 1:1 (Landmarks faciales sintéticos) -->
                    <g stroke="rgba(0, 229, 255, 0.55)" stroke-width="1" fill="#FCD116">
                      <circle cx="134" cy="108" r="2.5"/>
                      <circle cx="186" cy="108" r="2.5"/>
                      <circle cx="160" cy="132" r="2.5"/>
                      <circle cx="140" cy="160" r="2.2"/>
                      <circle cx="180" cy="160" r="2.2"/>
                      <circle cx="160" cy="82" r="2.2"/>
                      <circle cx="116" cy="126" r="2"/>
                      <circle cx="204" cy="126" r="2"/>
                      <circle cx="160" cy="186" r="2.2"/>
                      <line x1="134" y1="108" x2="186" y2="108"/>
                      <line x1="134" y1="108" x2="160" y2="132"/>
                      <line x1="186" y1="108" x2="160" y2="132"/>
                      <line x1="160" y1="132" x2="140" y2="160"/>
                      <line x1="160" y1="132" x2="180" y2="160"/>
                      <line x1="140" y1="160" x2="180" y2="160"/>
                      <line x1="160" y1="82" x2="134" y2="108"/>
                      <line x1="160" y1="82" x2="186" y2="108"/>
                      <line x1="116" y1="126" x2="134" y2="108"/>
                      <line x1="204" y1="126" x2="186" y2="108"/>
                      <line x1="140" y1="160" x2="160" y2="186"/>
                      <line x1="180" y1="160" x2="160" y2="186"/>
                    </g>

                    <!-- Línea láser de escaneo -->
                    <line id="scanner-laser-line" class="scanner-laser-line" x1="58" y1="70" x2="262" y2="70" stroke="url(#scanLaserGrad)" stroke-width="3"/>
                  </svg>
                </div>

                <div class="scanner-telemetry-strip">
                  <div><small>MODO</small><strong>Comparación 1:1</strong></div>
                  <div><small>GALERÍA 1:N</small><strong>Deshabilitada</strong></div>
                  <div><small>PERSISTENCIA</small><strong>0 Bytes en S3/DB</strong></div>
                </div>

                <div class="scanner-cam-controls">
                  <button id="btn-toggle-webcam" class="gov-btn-cam-toggle" type="button">
                    📷 Activar / Apagar Vista de Cámara Local
                  </button>
                </div>
              </div>

              <!-- CONSENTIMIENTO INFORMADO LEY 1581 DE 2012 -->
              <div class="consent-box gov-consent-card">
                <div class="gov-consent-header">
                  <span class="gov-consent-seal">⚖️ LEY ESTATUTARIA 1581 DE 2012</span>
                  <span id="consent-status-pill" class="gov-consent-pill">Consentimiento requerido</span>
                </div>
                <strong>Autorización previa, expresa e informada para tratamiento biométrico efímero</strong>
                <ul class="gov-consent-list">
                  <li><strong>Finalidad exclusiva:</strong> Verificación facial 1:1 en memoria volátil para este simulador educativo.</li>
                  <li><strong>Cero retención:</strong> <code>0 segundos</code> tras el cálculo. Ninguna imagen ni vector se guarda en disco, AWS S3, Stellar ni registros.</li>
                  <li><strong>Sin coerción:</strong> Si no deseas usar cámara o el motor local no está instalado, dispones del <strong>Pin de Contingencia Autorizado</strong> con plenos efectos en el MVP.</li>
                </ul>

                <label class="checkbox-row gov-consent-checkbox" for="biometric-consent-check">
                  <input id="biometric-consent-check" type="checkbox" />
                  <span>He leído y acepto libremente el procesamiento biométrico efímero de prueba (Retención 0 s).</span>
                </label>

                <div class="button-row">
                  <button id="btn-consent-grant" class="gov-btn-consent-ok" type="button">✓ Firmar y Registrar Consentimiento</button>
                  <button id="btn-consent-revoke" class="button-danger" type="button">✕ Revocar y Limpiar RAM</button>
                </div>
              </div>
            </div>

            <!-- TARJETAS DE ACCIÓN PASO 3A Y 3B -->
            <div class="form-grid" style="margin-top:1rem;">
              <div class="panel-subtle gov-method-card">
                <div class="gov-method-badge-row">
                  <span class="eyebrow">OPCIÓN 3A · BIOMETRÍA FACIAL 1:1</span>
                  <span class="gov-tag-sdk">FacePlugin SDK</span>
                </div>
                <h4>Escaneo Facial 1:1 en Vivo</h4>
                <p class="small-note">Evalúa la biblioteca <code>Faceplugin-ltd/Open-Source-Face-Recognition-SDK</code>. Si el runtime nativo no está instalado en este servidor, informa el estado real sin fingir una coincidencia biométrica.</p>
                <button id="btn-faceplugin-verify" class="gov-btn-primary" type="button">
                  🧬 Ejecutar Escaneo Facial 1:1 en FacePlugin SDK
                </button>
              </div>

              <div class="panel-subtle gov-method-card gov-method-card-alt">
                <div class="gov-method-badge-row">
                  <span class="eyebrow">OPCIÓN 3B · CANAL ALTERNATIVO GARANTIZADO</span>
                  <span class="gov-tag-alt">Accesibilidad / Contingencia</span>
                </div>
                <h4>Pin de Contingencia Estatal Autorizado</h4>
                <p class="small-note">Canal oficial cuando la cámara no está disponible, decides no usar biometría o ejecutas el MVP en la nube sin pesos biométricos locales.</p>
                <label for="fallback-code-input">Credencial alfanumérica de contingencia</label>
                <input id="fallback-code-input" class="gov-input" value="ALT-CONSENSUS-2026" autocomplete="off" />
                <div class="button-row" style="margin-top:.65rem;">
                  <button id="btn-fallback-verify" class="gov-btn-primary gov-btn-navy" type="button">
                    🔑 Validar Contingencia y Avanzar al Paso 4 →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ==================== PASO 4: EMISIÓN DE SESIÓN SEGURA ==================== -->
        <div id="auth-step-4" class="auth-step-pane" hidden>
          <div class="gov-step-card gov-step4-certificate">
            <div class="gov-cert-icon">🏛️</div>
            <span class="gov-badge-official">FACTORES DE SEGURIDAD VERIFICADOS</span>
            <h3>Credencial de Sesión Criptográfica Lista para Emitir</h3>
            <p class="muted">Se han completado satisfactoriamente todas las validaciones de seguridad requeridas por el protocolo de identidad digital:</p>

            <div class="gov-cert-checks">
              <div class="gov-cert-item"><span>✓</span><strong>Paso 1:</strong> Correo normalizado y Google reCAPTCHA validado en backend</div>
              <div class="gov-cert-item"><span>✓</span><strong>Paso 2:</strong> Código OTP criptográfico de 6 dígitos verificado e invalidado</div>
              <div class="gov-cert-item"><span>✓</span><strong>Paso 3:</strong> Verificación de identidad / contingencia bajo Ley 1581 de 2012</div>
              <div class="gov-cert-item"><span>✓</span><strong>Paso 4:</strong> Cookie <code>HttpOnly</code> + <code>SameSite=Lax</code> + Token CSRF (0 datos en localStorage)</div>
            </div>

            <button id="btn-step4-issue" class="gov-btn-gold-cta gov-btn-large" type="button">
              🗳️ Emitir Sesión Autenticada y Abrir Mapa Electoral Consensus →
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ESPACIO DE TRABAJO PRINCIPAL (PANTALLAS 4 A 14) -->
  <main id="workspace-shell" class="app-shell" hidden>
    <aside class="sidebar" aria-label="Navegación de la aplicación">
      <p class="eyebrow">ESPACIO DE TRABAJO</p>
      <a class="nav-link active" href="#territory-panel"><span>01</span> ¿Dónde podrás votar?</a>
      <a class="nav-link" href="#vote-panel"><span>02</span> Cabina de Votación</a>
      <a class="nav-link" href="#processes-panel"><span>03</span> 12 Mecanismos en Colombia</a>
      <a class="nav-link" href="#results-panel"><span>04</span> Resultados y Escrutinio</a>
      <a class="nav-link" href="#admin-panel"><span>05</span> Panel Administrativo</a>
      <a class="nav-link" href="#overview"><span>06</span> Estado de Sesión y Wallet</a>
      <a class="nav-link" href="#infra-panel"><span>07</span> Infraestructura y CI/CD</a>
      <a class="nav-link" href="#evidence-panel"><span>08</span> Evidencia y Auditoría</a>
      <div class="sidebar-note"><span class="live-dot"></span><div><strong>Colombia y el Mundo</strong><small>33 Dptos · 1,122 Mpios · Consulados</small></div></div>
    </aside>

    <div class="page-content">
      <!-- SECCIÓN PRINCIPAL 100% UX/UI: ¿DÓNDE PODRÁS VOTAR? MAPA INTERACTIVO + SELECTORES -->
      <section id="territory-panel" class="donde-votar-section" aria-labelledby="territory-heading">
        <div class="donde-votar-layout">
          <!-- COLUMNA IZQUIERDA: MAPA INTERACTIVO OPENSTREETMAP CON PUNTOS EN COLOMBIA Y EL MUNDO -->
          <div class="donde-votar-map-col">
            <div id="colombia-map-mount" class="colombia-map-mount"></div>
          </div>

          <!-- COLUMNA DERECHA: SELECTORES EN CASCADA (DEPARTAMENTO, MUNICIPIO, PUESTO DE VOTACIÓN + RESET AZUL) -->
          <div class="donde-votar-controls-col">
            <h1 id="territory-heading" class="donde-votar-heading">¿Dónde podrás votar?</h1>
            <p class="donde-votar-subtitle">Consulta el número y ubicación de los puestos de votación en Colombia y el mundo.</p>

            <div class="donde-votar-selectors-stack">
              <div class="reg-select-field">
                <label for="territory" class="sr-only">Departamento o País</label>
                <select id="territory" class="reg-pill-select" aria-label="Departamento o País">
                  <optgroup label="Colombia — 32 Departamentos y Bogotá D.C.">
                    ${allDepartments
                      .map(
                        (dept) =>
                          `<option value="${dept.code}" ${dept.code === '05' ? 'selected' : ''}>${dept.name} (${dept.municipalities.length})</option>`,
                      )
                      .join('')}
                  </optgroup>
                  <optgroup label="Exterior — Países y Consulados en el Mundo">
                    ${internationalCountries
                      .map(
                        (country) =>
                          `<option value="${country.code}">🌎 ${country.name}</option>`,
                      )
                      .join('')}
                  </optgroup>
                </select>
              </div>

              <div class="reg-select-field">
                <label for="municipality-select" class="sr-only">Municipio o Ciudad</label>
                <select id="municipality-select" class="reg-pill-select" aria-label="Municipio o Ciudad"></select>
              </div>

              <div class="reg-select-row-with-reset">
                <div class="reg-select-field reg-select-grow">
                  <label for="voting-station-select" class="sr-only">Puesto de Votación</label>
                  <select id="voting-station-select" class="reg-pill-select" aria-label="Puesto de Votación"></select>
                </div>
                <button id="btn-reset-map-selectors" class="reg-reset-btn" type="button" title="Restablecer vista de Colombia y el mundo" aria-label="Restablecer mapa y selectores">
                  ↺
                </button>
              </div>
            </div>

            <!-- BUSCADOR RÁPIDO DE CUALQUIER CIUDAD, MUNICIPIO O PAÍS -->
            <div class="donde-votar-search-box">
              <input id="territory-search" class="reg-pill-input" type="search" placeholder="🔍 Buscar departamento, ciudad, municipio o país (ej. Medellín, Bogotá, Cali, Miami, Madrid)…" autocomplete="off" />
              <div id="territory-search-results" class="search-results-strip" aria-live="polite"></div>
            </div>

            <!-- FICHA DEL PUESTO DE VOTACIÓN ELEGIDO Y BOTÓN PARA CORRER EL SISTEMA -->
            <div id="divipola-detail-box" class="reg-station-runner-card" aria-live="polite"></div>
          </div>
        </div>

        <div class="territory-grid" style="margin-top:1.15rem;">
          ${territories
            .slice(0, 10)
            .map(
              (territory) =>
                `<button class="territory-card${territory.pilot ? ' selected' : ''}" type="button" data-territory="${territory.departmentCode}" aria-pressed="${territory.pilot ? 'true' : 'false'}"><span class="territory-name">[${territory.departmentCode}] ${territory.name}</span><span class="territory-capital">${territory.capital}${territory.pilot ? ' · piloto' : ''}</span><span class="territory-readiness" data-readiness="${territory.code}">Revisando configuración…</span></button>`,
            )
            .join('')}
        </div>
        <p class="territory-note">Catálogo oficial DANE DIVIPOLA (SHA-256: <code>${divipolaMetadata.sha256.slice(0, 20)}…</code>) + Circunscripción Internacional Consular · MVP educativo sobre Stellar Testnet.</p>
      </section>

      <!-- PANTALLA 4: RESUMEN DEL PARTICIPANTE Y CONEXIÓN STELLAR -->
      <section id="overview" class="hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">CONSENSUS COLOMBIA <span class="eyebrow-divider">/</span> MVP PARTICIPACIÓN DEMOCRÁTICA</p>
          <h2>Participación verificable<br><em>en Stellar Testnet</em></h2>
          <p class="hero-description">Plataforma configurable con mapa interactivo de los 32 departamentos, Bogotá D.C., los 1,122 municipios de Colombia y consulados en el mundo, 12 mecanismos de participación ciudadana y contratos Soroban.</p>
        </div>
        <div class="hero-stamp"><span>CO</span><strong id="hero-dept-stamp">ANTIOQUIA</strong><small id="hero-mpio-stamp">MEDELLÍN · 05001</small></div>
        <div class="warning-banner"><span class="warning-icon">!</span><p><strong>Límite obligatorio del MVP educativo:</strong> No es un sistema certificado para elecciones oficiales. No ofrece voto secreto criptográfico en cadena pública ni sustituye el censo de la Registraduría; usa exclusivamente cuentas y datos sintéticos.</p></div>
      </section>

      <section class="summary-grid" aria-label="Estado de sesión y laboratorio">
        <article class="summary-card">
          <span class="eyebrow">SESIÓN Y ROL ACTIVO</span>
          <strong id="active-user-role">Sin sesión</strong>
          <small id="active-user-email">Autenticación de 4 pasos requerida</small>
        </article>
        <article class="summary-card">
          <span class="eyebrow">PUESTO Y TERRITORIO ACTIVO</span>
          <strong id="active-place">MEDELLÍN, ANTIOQUIA (05001)</strong>
          <small id="territory-caption">32 departamentos + Bogotá D.C. · 1,122 municipios + Exterior</small>
        </article>
        <article class="summary-card">
          <span class="eyebrow">CONTRATO SOROBAN</span>
          <strong id="contract-status" class="status-line"><i class="status-dot"></i>${activeContractId() ? 'Contrato configurado en Testnet' : 'Contrato pendiente de despliegue en Testnet'}</strong>
          <small>WASM Rust verificado · sin ID inventado</small>
        </article>
        <article class="summary-card">
          <span class="eyebrow">BILLETERA STELLAR</span>
          <strong id="account">Sin wallet</strong>
          <small id="wallet-state" aria-live="polite">Freighter es el firmante habilitado en Testnet.</small>
        </article>
      </section>

      <section class="place-gallery" aria-label="Medellín y Antioquia">
        <div class="gallery-heading"><div><p class="eyebrow">ESCENARIO PILOTO</p><h2>Medellín y Antioquia (05001)</h2></div><p>Piloto visual inicial acompañado del catálogo completo de los 1,122 municipios de Colombia.</p></div>
        <div class="gallery-grid">
          <figure class="place-card place-large"><img src="/images/medellin-valle.webp" alt="Panorámica urbana del Valle de Aburrá" /><figcaption><strong>Valle de Aburrá</strong><span>Medellín · Antioquia (05001)</span></figcaption></figure>
          <figure class="place-card"><img src="/images/medellin-plaza.webp" alt="Letras de Medellín en un espacio público arbolado" loading="lazy" /><figcaption><strong>Arte y ciudad</strong><span>Medellín</span></figcaption></figure>
          <figure class="place-card"><img src="/images/guatape-antioquia.webp" alt="La Piedra del Peñol y el paisaje de Guatapé" loading="lazy" /><figcaption><strong>Guatapé</strong><span>Antioquia (05321)</span></figcaption></figure>
          <figure class="place-card"><img src="/images/medellin-centro.webp" alt="Centro urbano de Medellín durante el atardecer" loading="lazy" /><figcaption><strong>Centro de Medellín</strong><span>Ciudad y patrimonio</span></figcaption></figure>
        </div>
      </section>

      <!-- PANTALLAS 5 Y 6: LISTADO DE PROCESOS, MECANISMOS DE PARTICIPACIÓN Y DETALLE DEL PROCESO -->
      <section id="processes-panel" class="workspace-grid">
        <article class="panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">PANTALLAS 05 Y 06 / PROCESOS DISPONIBLES Y DETALLE</p>
              <h2>Procesos de Votación y Mecanismos de Participación en Colombia</h2>
            </div>
            <span class="tag tag-sand">12 Plantillas Configurables</span>
          </div>
          <label for="active-process-select">Seleccionar proceso activo para inspeccionar, deliberar o votar</label>
          <select id="active-process-select"></select>
          <div id="process-detail-card" class="panel-subtle" style="margin-top:0.85rem;"></div>

          <!-- Flujo deliberativo exclusivo para Cabildo Abierto e Iniciativa Ciudadana -->
          <div id="deliberative-flow-box" class="consent-box" style="margin-top:0.85rem;" hidden>
            <strong>Flujo Deliberativo de Ponencias y Apoyos (Cabildo Abierto / Iniciativa Ciudadana)</strong>
            <p class="small-note">Este mecanismo no funciona como una elección de candidatos ni se reduce a una papeleta digital: permite inscribir ponencias o propuestas normativas para deliberación pública.</p>
            <div class="form-grid">
              <div>
                <label for="proposal-title">Título de ponencia o articulado sintético</label>
                <input id="proposal-title" placeholder="Ej. Ponencia sobre movilidad escolar sostenible" />
              </div>
              <div>
                <label for="proposal-summary">Resumen motivado</label>
                <input id="proposal-summary" placeholder="Resumen de la propuesta ciudadana para el acta…" />
              </div>
            </div>
            <button id="btn-add-proposal" class="button-quiet" type="button">+ Radicar ponencia en el proceso</button>
            <ul id="proposals-list" class="role-list" style="margin-top:0.6rem;"></ul>
          </div>
        </article>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">CATÁLOGO NORMATIVO PEDAGÓGICO</p>
              <h2>Mecanismos (Ley 134/1994 y Ley 1757/2015)</h2>
            </div>
            <span class="role-count">12</span>
          </div>
          <ul class="role-list">
            ${votingMechanismTemplates
              .map(
                (tpl, idx) =>
                  `<li><span>${String(idx + 1).padStart(2, '0')}</span><div><strong>${tpl.name}</strong><br/><small>${tpl.normative_basis} · ${tpl.deliberation_flow_required ? 'Flujo deliberativo/apoyos' : 'Papeleta configurable'}</small></div></li>`,
              )
              .join('')}
          </ul>
        </article>
      </section>

      <!-- PANTALLAS 7, 8 Y 9: VOTACIÓN, CONFIRMACIÓN DEL VOTO, COMPROBANTE TÉCNICO Y RESULTADOS -->
      <section id="vote-panel" class="workspace-grid">
        <article class="panel election-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">PANTALLAS 07 Y 08 / PARTICIPACIÓN, CONFIRMACIÓN Y COMPROBANTE</p>
              <h2>Emisión y Confirmación de Voto</h2>
            </div>
            <span class="tag tag-sand">Validación en Backend + Soroban</span>
          </div>
          <p class="muted">El frontend no decide por sí solo la validez de un voto: las reglas de estado, unicidad, horario y opción válida se verifican en la capa de dominio y en el contrato Soroban.</p>

          <label for="vote-option-select">Seleccionar opción válida del proceso activo</label>
          <select id="vote-option-select"></select>

          <label for="option">Código corto para invocación directa Soroban (1 a 9 caracteres)</label>
          <input id="option" maxlength="9" value="A" autocomplete="off" />

          <label class="checkbox-row" for="confirm-vote-check">
            <input id="confirm-vote-check" type="checkbox" />
            <span>Confirmo mi selección sintética y comprendo que en Stellar Testnet la transacción no proporciona secreto electoral.</span>
          </label>

          <div class="button-row">
            <button id="btn-local-vote" type="button">Registrar voto verificado en proceso activo</button>
            <button id="cast" class="button-dark" type="button">Firmar voto on-chain en Freighter</button>
            <button id="refresh" class="button-quiet" type="button">Actualizar estado Soroban</button>
          </div>

          <div id="vote-receipt-box" class="panel-subtle" style="margin-top:0.85rem;">
            <strong>Comprobante técnico de operación:</strong> Aún no has emitido una operación en esta sesión.
          </div>

          <div class="result-strip">
            <div><span class="eyebrow">ESTADO ON-CHAIN</span><strong id="election-state">Aún sin consultar</strong></div>
            <div><span class="eyebrow">VOTOS ON-CHAIN</span><strong id="total-votes">—</strong></div>
            <button id="result" class="button-quiet" type="button">Consultar conteo Soroban</button>
          </div>
        </article>

        <!-- PANTALLA 9: CONSULTA DE RESULTADOS Y ESCRUTINIO -->
        <article id="results-panel" class="panel network-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">PANTALLA 09 / ESCRUTINIO Y RESULTADOS AGREGADOS</p>
              <h2>Resultados y Reglas de Mayoría</h2>
            </div>
            <span class="network-icon">✳</span>
          </div>
          <div id="results-summary-box"></div>
          <hr style="border:0;border-top:1px solid var(--line);margin:0.85rem 0;" />
          <div class="info-row"><span class="info-icon">◉</span><div><strong>Stellar Testnet</strong><small>Las transacciones solo se marcan como confirmadas tras verificar su estado en ledger.</small></div></div>
          <div class="info-row"><span class="info-icon">⌘</span><div><strong>Separación de datos</strong><small>El marcador de participación está desacoplado del contenido de la boleta en la API.</small></div></div>
          <a class="text-link" href="https://stellar.expert/explorer/testnet" target="_blank" rel="noreferrer">Explorador Stellar Testnet <span>↗</span></a>
        </article>
      </section>

      <!-- PANTALLAS 10 Y 11: PANEL ADMINISTRATIVO Y CREACIÓN/CONFIGURACIÓN DE PROCESOS -->
      <section id="admin-panel" class="workspace-grid admin-grid">
        <article class="panel admin-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">PANTALLAS 10 Y 11 / ADMINISTRACIÓN Y CREACIÓN DE PROCESOS</p>
              <h2>Configurar Nuevo Proceso o Administrar Contrato</h2>
            </div>
            <span class="tag tag-outline">Rol Administrador + TOTP + 5 de 8</span>
          </div>
          <p class="muted">Los ocho administradores del proyecto son perfiles de gobernanza de la aplicación (umbral objetivo 5-de-8), NO nodos validadores de la red Stellar.</p>

          <div class="panel-subtle" style="margin-bottom:0.9rem;">
            <strong>Crear y configurar nuevo proceso de votación o participación</strong>
            <div class="form-grid">
              <div>
                <label for="new-proc-template">Plantilla de mecanismo</label>
                <select id="new-proc-template">
                  ${votingMechanismTemplates
                    .map(
                      (t) =>
                        `<option value="${t.template_id}">${t.name}</option>`,
                    )
                    .join('')}
                </select>
              </div>
              <div>
                <label for="new-proc-scope">Ámbito territorial</label>
                <select id="new-proc-scope">
                  <option value="municipal">Municipal / Distrital</option>
                  <option value="departamental">Departamental</option>
                  <option value="nacional">Nacional</option>
                  <option value="organizacion">Interno de Organización</option>
                </select>
              </div>
            </div>
            <div class="form-grid">
              <div>
                <label for="new-proc-title">Título del proceso</label>
                <input id="new-proc-title" value="Simulación de Consulta Popular Municipal" />
              </div>
              <div>
                <label for="new-proc-question">Pregunta</label>
                <input id="new-proc-question" value="¿Aprueba la priorización sintética del proyecto comunitario?" />
              </div>
            </div>
            <div class="form-grid">
              <div>
                <label for="new-proc-options">Opciones válidas (separadas por coma)</label>
                <input id="new-proc-options" value="SI_APRUEBO, NO_APRUEBO" />
              </div>
              <div>
                <label for="new-proc-threshold">Umbral de participación (%) / Censo sintético</label>
                <input id="new-proc-threshold" type="number" min="0" max="100" step="0.5" value="33.3" />
              </div>
            </div>
            <div class="button-row">
              <button id="btn-create-process" type="button">+ Crear proceso configurado</button>
              <button id="btn-toggle-process-state" class="button-quiet" type="button">Alternar Abierto / Cerrado</button>
            </div>
          </div>

          <div class="form-grid">
            <div><label for="admin-token">Token de laboratorio</label><input id="admin-token" type="password" autocomplete="off" /></div>
            <div><label for="admin-otp">Código TOTP de autenticador</label><input id="admin-otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" /></div>
          </div>
          <div class="admin-actions">
            <button id="add-option" type="button">+ Agregar opción on-chain</button>
            <button id="open" type="button">Abrir en Soroban</button>
            <button id="close" class="button-danger" type="button">Cerrar en Soroban</button>
          </div>
          <label for="voter">Cuenta ficticia que se autoriza en contrato Soroban</label>
          <div class="inline-form">
            <input id="voter" maxlength="56" placeholder="Dirección pública G… de Testnet" autocomplete="off" />
            <button id="authorize" type="button">Autorizar en Soroban</button>
          </div>
        </article>

        <article class="panel roles-panel">
          <div class="panel-heading"><div><p class="eyebrow">GOBERNANZA DE APLICACIÓN</p><h2>Ocho perfiles (5 de 8)</h2></div><span class="role-count">08</span></div>
          <ul class="role-list">${demoAdmins.map((admin, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span>${admin}</li>`).join('')}</ul>
          <p class="small-note">Son perfiles ficticios de aplicación, no nodos validadores de Stellar ni representantes de entidades públicas.</p>
        </article>
      </section>

      <!-- PANTALLAS 13 Y 14: ESTADO DE INFRAESTRUCTURA E INTEGRACIONES + AUDITORÍA Y DIAGNÓSTICO -->
      <section id="infra-panel" class="workspace-grid">
        <article class="panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">PANTALLA 13 / ESTADO DE INFRAESTRUCTURA E INTEGRACIONES</p>
              <h2>AWS S3 + IAM, CircleCI, Terraform, Ansible y FacePlugin</h2>
            </div>
            <span class="tag tag-outline">Verificado sin secretos</span>
          </div>
          <div class="info-row"><span class="info-icon">☁</span><div><strong>AWS S3 + IAM Mínimo Privilegio (Terraform)</strong><small>Bucket privado con cifrado AES256, bloqueo público total y roles separados (<code>app-runtime-role</code> lectura vs <code>ci-deploy-role</code> escritura). Prohibido guardar votos, claves, OTP o biometría.</small></div></div>
          <div class="info-row"><span class="info-icon">⚙</span><div><strong>CI/CD Reproducible (CircleCI + GitHub API)</strong><small>14 trabajos en <code>.circleci/config.yml</code>: TypeScript, Django, FastAPI, Rust/Soroban WASM, escaneo de secretos, manifiesto SHA-256 y promoción controlada a S3.</small></div></div>
          <div class="info-row"><span class="info-icon">⧉</span><div><strong>Ansible Automatización de Entornos</strong><small>Inventarios <code>dev</code>, <code>test</code> y <code>staging</code> con roles idempotentes para servicios reales (sin validadores Stellar ficticios).</small></div></div>
          <div class="info-row"><span class="info-icon">☺</span><div><strong>Evaluación Técnica de FacePlugin SDK</strong><small>Repositorio auditado (<code>Faceplugin-ltd/Open-Source-Face-Recognition-SDK</code>): sin archivo SPDX <code>LICENSE</code> en raíz ni módulo verificable de prueba de vida; desacoplado tras <code>FaceRecognitionProvider</code> sin simular coincidencias reales.</small></div></div>
        </article>

        <article id="evidence-panel" class="panel evidence-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">PANTALLA 14 / AUDITORÍA, TRAZABILIDAD Y DIAGNÓSTICO</p>
              <h2>Evidencia en Red y Registro de Auditoría</h2>
            </div>
            <span class="tag tag-sand">Solo confirmaciones reales</span>
          </div>
          <p id="evidence" aria-live="polite" class="evidence-empty">Todavía no hay transacciones confirmadas en esta sesión. Las operaciones aparecerán aquí únicamente después de confirmarse en Stellar Testnet.</p>
          <div id="audit-log-box" class="panel-subtle" style="margin-top:0.85rem;">
            <strong>Registro de eventos de seguridad (sin PII ni secretos):</strong>
            <ul id="audit-events-list" class="role-list"></ul>
          </div>
        </article>
      </section>

      <footer>
        <strong>Stack del MVP Consensus Colombia</strong>
        <span>TypeScript/Vite · Rust/Soroban WASM · Django Identity · FastAPI Integration · DANE DIVIPOLA (1,122 mpios) · CircleCI · Terraform AWS S3/IAM · Ansible</span>
        <p>Prototipo educativo y experimental: no certificado para elecciones oficiales, sin secreto electoral en cadena pública y sin almacenamiento de biometría ni claves privadas.</p>
      </footer>
    </div>
  </main>
`;

const message = root.querySelector<HTMLParagraphElement>('#wallet-state')!;
const connectButton = root.querySelector<HTMLButtonElement>('#connect')!;
const logoutButton = root.querySelector<HTMLButtonElement>('#logout-btn')!;
const sessionBadge = root.querySelector<HTMLElement>('#session-badge')!;
const authGate = root.querySelector<HTMLElement>('#auth-gate')!;
const workspaceShell = root.querySelector<HTMLElement>('#workspace-shell')!;
const authAlert = root.querySelector<HTMLElement>('#auth-alert')!;

const auditEvents: Array<{ time: string; action: string; detail: string }> = [];

function recordLocalAudit(action: string, detail: string): void {
  const time = new Date().toISOString().slice(11, 19);
  auditEvents.unshift({ time, action, detail });
  const listEl = root!.querySelector<HTMLUListElement>('#audit-events-list');
  if (listEl) {
    listEl.innerHTML = auditEvents
      .slice(0, 8)
      .map(
        (ev, idx) =>
          `<li><span>${String(idx + 1).padStart(2, '0')}</span><div><strong>${ev.action}</strong> (${ev.time})<br/><small>${ev.detail}</small></div></li>`,
      )
      .join('');
  }
}

// ============================================================================
// 4-Step Authentication Gate Controller
// ============================================================================

function syncOtpVisualBoxes(rawCode: string): void {
  const digitsContainer = root!.querySelector<HTMLElement>('#otp-visual-digits');
  if (!digitsContainer) return;
  const clean = rawCode.replace(/\D/g, '').slice(0, 6);
  const boxes = digitsContainer.querySelectorAll<HTMLElement>('.otp-digit-box');
  boxes.forEach((box, idx) => {
    const ch = clean[idx];
    box.textContent = ch ?? '•';
    box.classList.toggle('filled', Boolean(ch));
  });
}

function setAuthStepUI(step: 1 | 2 | 3 | 4, alertText: string, isError = false): void {
  activeAuthStep = step;
  authAlert.textContent = alertText;
  authAlert.classList.toggle('auth-alert-error', isError);
  for (const s of [1, 2, 3, 4] as const) {
    const pane = root!.querySelector<HTMLElement>(`#auth-step-${s}`)!;
    const ind = root!.querySelector<HTMLElement>(`#step-ind-${s}`)!;
    pane.hidden = s !== step;
    ind.classList.toggle('active', s === step);
    ind.classList.toggle('done', s < step);
  }
}

function syncRoleCards(selectedEmail: string): void {
  root!.querySelectorAll<HTMLButtonElement>('.gov-role-card').forEach((card) => {
    const isMatch = card.dataset.presetEmail === selectedEmail;
    card.classList.toggle('active', isMatch);
  });
}

root.querySelectorAll<HTMLButtonElement>('.gov-role-card').forEach((card) => {
  card.addEventListener('click', () => {
    const email = card.dataset.presetEmail || 'participante.demo@consensus.local';
    root!.querySelector<HTMLSelectElement>('#login-preset')!.value = email;
    root!.querySelector<HTMLInputElement>('#login-email')!.value = email;
    syncRoleCards(email);
  });
});

root.querySelector<HTMLSelectElement>('#login-preset')!.addEventListener('change', (ev) => {
  const val = (ev.currentTarget as HTMLSelectElement).value;
  root!.querySelector<HTMLInputElement>('#login-email')!.value = val;
  syncRoleCards(val);
});

const recaptchaVisualCheckbox = root.querySelector<HTMLInputElement>('#recaptcha-visual-checkbox');
const recaptchaSelect = root.querySelector<HTMLSelectElement>('#login-recaptcha')!;
if (recaptchaVisualCheckbox) {
  recaptchaVisualCheckbox.addEventListener('change', () => {
    recaptchaSelect.value = recaptchaVisualCheckbox.checked
      ? 'test-recaptcha-pass-consensus'
      : 'invalid-bot-token';
  });
}
recaptchaSelect.addEventListener('change', () => {
  if (recaptchaVisualCheckbox) {
    recaptchaVisualCheckbox.checked = recaptchaSelect.value === 'test-recaptcha-pass-consensus';
  }
});

const otpInputEl = root.querySelector<HTMLInputElement>('#login-otp')!;
otpInputEl.addEventListener('input', () => {
  syncOtpVisualBoxes(otpInputEl.value);
});

root.querySelector<HTMLButtonElement>('#btn-step1-submit')!.addEventListener('click', async () => {
  try {
    const email = root!.querySelector<HTMLInputElement>('#login-email')!.value;
    const recaptchaToken = root!.querySelector<HTMLSelectElement>('#login-recaptcha')!.value;
    const res = await startLoginStep1(email, recaptchaToken);
    activeChallengeId = res.challenge_id;
    const sandboxBox = root!.querySelector<HTMLElement>('#sandbox-otp-box')!;
    if (res.sandbox_otp_preview) {
      sandboxBox.innerHTML = `
        <div class="gov-otp-mail-row">
          <div>
            <strong>Destinatario:</strong> <code>${res.masked_email}</code> (${res.connection_mode})<br/>
            <span>Tu código oficial de verificación de un solo uso es:</span>
          </div>
          <div class="gov-otp-code-pill">
            <code id="sandbox-otp-code">${res.sandbox_otp_preview}</code>
          </div>
        </div>
      `;
      otpInputEl.value = res.sandbox_otp_preview;
      syncOtpVisualBoxes(res.sandbox_otp_preview);
    } else {
      sandboxBox.textContent = res.message;
    }
    recordLocalAudit('Paso 1 completado', `Correo normalizado (${res.masked_email}) y reCAPTCHA validado.`);
    setAuthStepUI(2, `Paso 2 de 4: Se envió el código OTP de 6 dígitos a ${res.masked_email}. Confírmalo para continuar.`);
  } catch (err) {
    setAuthStepUI(1, err instanceof Error ? err.message : 'Error en Paso 1', true);
  }
});

root.querySelector<HTMLButtonElement>('#btn-step2-verify')!.addEventListener('click', async () => {
  try {
    const code = otpInputEl.value;
    await verifyOtpStep2(activeChallengeId, code);
    recordLocalAudit('Paso 2 completado', 'Código OTP verificado e invalidado tras un solo uso.');
    setAuthStepUI(
      3,
      'Paso 3 de 4: Autoriza el consentimiento biométrico (Ley 1581/2012) o utiliza el Pin de Contingencia Estatal Autorizado.',
    );
  } catch (err) {
    setAuthStepUI(2, err instanceof Error ? err.message : 'Error en verificación OTP', true);
  }
});

root.querySelector<HTMLButtonElement>('#btn-step2-resend')!.addEventListener('click', () => {
  setAuthStepUI(
    2,
    'Enfriamiento de reenvío activo (60 segundos). Utiliza el código de 6 dígitos mostrado en la bandeja superior.',
  );
});

let activeWebcamStream: MediaStream | null = null;
const webcamBtn = root.querySelector<HTMLButtonElement>('#btn-toggle-webcam');
const webcamVideo = root.querySelector<HTMLVideoElement>('#biometric-webcam-video');
const scannerStatusLabel = root.querySelector<HTMLElement>('#scanner-status-label');

if (webcamBtn && webcamVideo) {
  webcamBtn.addEventListener('click', async () => {
    if (activeWebcamStream) {
      activeWebcamStream.getTracks().forEach((t) => t.stop());
      activeWebcamStream = null;
      webcamVideo.srcObject = null;
      webcamVideo.hidden = true;
      if (scannerStatusLabel) scannerStatusLabel.textContent = 'VISOR SINTÉTICO · 0.0s RAM';
      webcamBtn.textContent = '📷 Activar Vista de Cámara Local';
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Cámara web no disponible en este navegador');
      }
      activeWebcamStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } },
        audio: false,
      });
      webcamVideo.srcObject = activeWebcamStream;
      webcamVideo.hidden = false;
      if (scannerStatusLabel) scannerStatusLabel.textContent = 'CÁMARA ACTIVA · 0.0s RAM';
      webcamBtn.textContent = '⏹️ Apagar Cámara Local';
    } catch {
      if (scannerStatusLabel) scannerStatusLabel.textContent = 'MODO SIMULADOR · 0.0s RAM';
      setAuthStepUI(
        3,
        'Cámara física no detectada o sin permiso; visor biométrico sintético activo. Puedes usar el Pin de Contingencia Autorizado.',
      );
    }
  });
}

const consentStatusPill = root.querySelector<HTMLElement>('#consent-status-pill');

root.querySelector<HTMLButtonElement>('#btn-consent-grant')!.addEventListener('click', async () => {
  try {
    const checkbox = root!.querySelector<HTMLInputElement>('#biometric-consent-check')!;
    if (!checkbox.checked) {
      checkbox.checked = true;
    }
    await grantBiometricConsentStep3(activeChallengeId, checkbox.checked);
    biometricConsentChecked = true;
    if (consentStatusPill) {
      consentStatusPill.textContent = '✓ Consentimiento Activo (0s RAM)';
      consentStatusPill.classList.add('consent-pill-ok');
    }
    recordLocalAudit('Consentimiento informado', 'Aceptado bajo política Ley1581-2012-v1 (retención 0 s).');
    setAuthStepUI(
      3,
      'Consentimiento Ley 1581 registrado. Ejecuta el escaneo 1:1 en FacePlugin SDK o avanza con el Pin de Contingencia.',
    );
  } catch (err) {
    setAuthStepUI(3, err instanceof Error ? err.message : 'Error en consentimiento', true);
  }
});

root.querySelector<HTMLButtonElement>('#btn-consent-revoke')!.addEventListener('click', async () => {
  await revokeBiometricConsentStep3(activeChallengeId);
  biometricConsentChecked = false;
  root!.querySelector<HTMLInputElement>('#biometric-consent-check')!.checked = false;
  if (consentStatusPill) {
    consentStatusPill.textContent = 'Consentimiento revocado';
    consentStatusPill.classList.remove('consent-pill-ok');
  }
  recordLocalAudit('Consentimiento revocado', 'Estado biométrico efímero limpiado por solicitud del usuario.');
  setAuthStepUI(
    3,
    'Consentimiento biométrico revocado y memoria RAM limpiada. Puedes continuar con el Pin de Contingencia Autorizado.',
  );
});

root.querySelector<HTMLButtonElement>('#btn-faceplugin-verify')!.addEventListener('click', async () => {
  if (!biometricConsentChecked) {
    setAuthStepUI(
      3,
      'Primero haz clic en "✓ Firmar y Registrar Consentimiento" (Ley 1581 de 2012) o usa el Pin de Contingencia Autorizado.',
      true,
    );
    return;
  }
  const scannerCard = root!.querySelector<HTMLElement>('#biometric-scanner-card');
  scannerCard?.classList.add('is-scanning');
  if (scannerStatusLabel) scannerStatusLabel.textContent = 'ESCANEANDO 1:1...';
  const result = await verifyFacialStep3(activeChallengeId);
  setTimeout(() => {
    scannerCard?.classList.remove('is-scanning');
    if (scannerStatusLabel) scannerStatusLabel.textContent = 'RETENCIÓN: 0.0s RAM';
  }, 600);
  recordLocalAudit(
    'FacePlugin SDK 1:1',
    `engine_enabled=${result.engine_enabled}, simulated=${result.simulated}`,
  );
  if (!result.verified) {
    setAuthStepUI(3, result.message, true);
    return;
  }
  step3Completed = true;
  setAuthStepUI(4, 'Verificación 1:1 completada. Procede al Paso 4 para emitir la credencial de sesión.');
});

root.querySelector<HTMLButtonElement>('#btn-fallback-verify')!.addEventListener('click', async () => {
  try {
    const code = root!.querySelector<HTMLInputElement>('#fallback-code-input')!.value;
    await verifyFallbackStep3(activeChallengeId, code);
    step3Completed = true;
    if (activeWebcamStream) {
      activeWebcamStream.getTracks().forEach((t) => t.stop());
      activeWebcamStream = null;
    }
    recordLocalAudit('Paso 3 completado', 'Verificación mediante Pin de Contingencia Estatal Autorizado.');
    setAuthStepUI(4, 'Paso 4 de 4: Todos los factores verificados. Emite tu credencial de sesión autenticada.');
  } catch (err) {
    setAuthStepUI(3, err instanceof Error ? err.message : 'Código alternativo inválido', true);
  }
});

root.querySelector<HTMLButtonElement>('#btn-step4-issue')!.addEventListener('click', async () => {
  try {
    if (!step3Completed) {
      throw new Error('Completa el Paso 3 antes de emitir la sesión.');
    }
    currentSession = await issueSessionStep4(activeChallengeId);
    authGate.hidden = true;
    workspaceShell.hidden = false;
    logoutButton.hidden = false;
    sessionBadge.textContent = `${currentSession.role.toUpperCase()} · ${currentSession.masked_email}`;
    root!.querySelector<HTMLElement>('#active-user-role')!.textContent =
      `${currentSession.display_name} (${currentSession.role})`;
    root!.querySelector<HTMLElement>('#active-user-email')!.textContent =
      `${currentSession.masked_email} · Cookie HttpOnly · sin localStorage`;
    selectDepartmentAndMunicipality(currentSession.department_code, currentSession.territory_code);
    syncDependentTerritorySelectors();
    renderProcessesUI();
    recordLocalAudit(
      'Sesión emitida (Paso 4)',
      `Rol=${currentSession.role}, sujeto=${currentSession.subject_id}`,
    );
  } catch (err) {
    setAuthStepUI(4, err instanceof Error ? err.message : 'No fue posible emitir sesión', true);
  }
});

// 1-Click Fast Demo Login (runs all 4 steps in sequence for rapid testing on Vercel)
root.querySelector<HTMLButtonElement>('#btn-fast-demo-login')!.addEventListener('click', async () => {
  try {
    const email = root!.querySelector<HTMLInputElement>('#login-email')!.value;
    const res1 = await startLoginStep1(email, 'test-recaptcha-pass-consensus');
    activeChallengeId = res1.challenge_id;
    if (res1.sandbox_otp_preview) {
      await verifyOtpStep2(activeChallengeId, res1.sandbox_otp_preview);
    }
    await verifyFallbackStep3(activeChallengeId, 'ALT-CONSENSUS-2026');
    step3Completed = true;
    currentSession = await issueSessionStep4(activeChallengeId);
    authGate.hidden = true;
    workspaceShell.hidden = false;
    logoutButton.hidden = false;
    sessionBadge.textContent = `${currentSession.role.toUpperCase()} · ${currentSession.masked_email}`;
    root!.querySelector<HTMLElement>('#active-user-role')!.textContent =
      `${currentSession.display_name} (${currentSession.role})`;
    root!.querySelector<HTMLElement>('#active-user-email')!.textContent =
      `${currentSession.masked_email} · Cookie HttpOnly · sin localStorage`;
    selectDepartmentAndMunicipality(currentSession.department_code, currentSession.territory_code);
    syncDependentTerritorySelectors();
    renderProcessesUI();
    recordLocalAudit(
      'Demo Rápido (4 Pasos)',
      `Sesión emitida para ${currentSession.masked_email} (${currentSession.role})`,
    );
  } catch (err) {
    setAuthStepUI(1, err instanceof Error ? err.message : 'Error en demo rápido', true);
  }
});

logoutButton.addEventListener('click', async () => {
  await logoutSession();
  currentSession = null;
  activeChallengeId = '';
  biometricConsentChecked = false;
  step3Completed = false;
  workspaceShell.hidden = true;
  authGate.hidden = false;
  logoutButton.hidden = true;
  sessionBadge.textContent = 'Sesión cerrada';
  setAuthStepUI(1, 'Sesión cerrada e invalidada correctamente. Inicia sesión nuevamente cuando lo desees.');
});

// ============================================================================
// Interactive Colombia Map + Dependent DANE DIVIPOLA Selectors & Search
// ============================================================================

const deptSelect = root.querySelector<HTMLSelectElement>('#territory')!;
const mpioSelect = root.querySelector<HTMLSelectElement>('#municipality-select')!;
const stationSelect = root.querySelector<HTMLSelectElement>('#voting-station-select')!;
const resetMapBtn = root.querySelector<HTMLButtonElement>('#btn-reset-map-selectors')!;
const detailBox = root.querySelector<HTMLElement>('#divipola-detail-box')!;
const searchInput = root.querySelector<HTMLInputElement>('#territory-search')!;
const searchResultsBox = root.querySelector<HTMLElement>('#territory-search-results')!;
const mapMountEl = root.querySelector<HTMLElement>('#colombia-map-mount')!;

function ensureProcessForTerritory(deptCode: string, mpioCode: string, templateId?: string): void {
  const dept = getDepartmentByCode(deptCode);
  const mpio = getMunicipalityByCode(mpioCode);
  const stations = getVotingStationsForMunicipality(deptCode, mpioCode);
  const { stationCode } = activeDivipolaCodes();
  const activeStation = stations.find((s) => s.stationCode === stationCode) ?? stations[0];

  const tpl =
    (templateId && votingMechanismTemplates.find((t) => t.template_id === templateId)) ||
    votingMechanismTemplates.find((t) => t.template_id === 'consulta_popular') ||
    votingMechanismTemplates[0];

  const existing = processesStore.find((p) => p.municipalityCode === mpioCode);
  if (existing && !templateId) {
    activeProcessId = existing.id;
    return;
  }

  const newId = `proc-${mpio.code}-${tpl.template_id.slice(0, 6)}`;
  const cleanTag = mpio.normalized.replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'LOCAL';
  const defaultOpts = tpl.deliberation_flow_required
    ? [`PONENCIA_CIVICA_${cleanTag}`, `COMPROMISO_MUNICIPAL_${mpio.code}`]
    : [`PROYECTO_${cleanTag}_A`, `PROYECTO_${cleanTag}_B`, 'VOTO_EN_BLANCO'];

  const tallies: Record<string, number> = {};
  for (const o of defaultOpts) tallies[o] = 0;

  const existingIdx = processesStore.findIndex((p) => p.id === newId);
  const procObj: LocalProcess = {
    id: newId,
    title: `${tpl.name} — ${mpio.name} (${dept.name})`,
    question: `¿Cuál opción respalda en ${activeStation.name} (${mpio.name} · ${mpio.code})?`,
    description: `Proceso ejecutándose en ${activeStation.name} (${activeStation.address}) con ${activeStation.tablesCount} mesas habilitadas sobre Stellar Testnet.`,
    templateId: tpl.template_id,
    templateName: tpl.name,
    category: tpl.category,
    deliberative: tpl.deliberation_flow_required,
    departmentCode: dept.code,
    departmentName: dept.name,
    municipalityCode: mpio.code,
    municipalityName: mpio.name,
    scope: dept.type === 'exterior_pais' ? 'internacional' : mpio.code === '11001' ? 'distrital' : 'municipal',
    state: 'open',
    options: defaultOpts,
    blankVoteEnabled: tpl.default_rules.blank_vote_enabled,
    maxSelections: tpl.default_rules.max_selections,
    censusSize: activeStation.potentialVoters,
    thresholdPct: tpl.default_rules.participation_threshold_pct,
    majorityRule: tpl.default_rules.required_majority_rule,
    tallies,
    voterMarkers: new Set(),
    proposals: tpl.deliberation_flow_required
      ? [
          {
            title: `Ponencia Ciudadana — ${mpio.name}`,
            summary: `Propuesta comunitaria radicada en ${activeStation.name}.`,
            author: 'Comité Cívico Sintético',
          },
        ]
      : [],
    receipts: [],
  };

  if (existingIdx >= 0) {
    processesStore[existingIdx] = procObj;
  } else {
    processesStore.unshift(procObj);
  }
  activeProcessId = newId;
}

const colombiaMap = initInteractiveColombiaMap(mapMountEl, (deptCode, mpioCode) => {
  ensureProcessForTerritory(deptCode, mpioCode);
  syncDependentTerritorySelectors(false);
  renderProcessesUI();
  const mpio = getMunicipalityByCode(mpioCode);
  const dept = getDepartmentByCode(deptCode);
  recordLocalAudit(
    'Punto elegido en Mapa',
    `[${mpio.code}] ${mpio.name}, ${dept.name} (${mpio.lat.toFixed(2)}°, ${mpio.lon.toFixed(2)}°)`,
  );
});

function syncDependentTerritorySelectors(refreshMap = true): void {
  const { departmentCode, municipalityCode, stationCode } = activeDivipolaCodes();
  const dept = getDepartmentByCode(departmentCode);
  const mpios = getMunicipalitiesForDepartment(departmentCode);
  const activeMpio = getMunicipalityByCode(municipalityCode);
  const stations = getVotingStationsForMunicipality(departmentCode, municipalityCode);
  const activeStation = stations.find((s) => s.stationCode === stationCode) ?? stations[0];
  const activeProc = processesStore.find((p) => p.id === activeProcessId) ?? processesStore[0];

  deptSelect.value = dept.code;
  mpioSelect.innerHTML = mpios
    .map(
      (m) =>
        `<option value="${m.code}" ${m.code === activeMpio.code ? 'selected' : ''}>${m.name} [${m.code}]${m.is_capital ? ' · Capital' : ''}</option>`,
    )
    .join('');

  stationSelect.innerHTML = stations
    .map(
      (st) =>
        `<option value="${st.stationCode}" ${st.stationCode === activeStation.stationCode ? 'selected' : ''}>${st.name} (${st.tablesCount} mesas)</option>`,
    )
    .join('');

  const contract = activeContractId();
  root!.querySelector<HTMLElement>('#contract-status')!.innerHTML =
    `<i class="status-dot"></i>${contract ? 'Contrato configurado en Testnet' : 'Contrato pendiente de configuración'}`;
  root!.querySelector<HTMLElement>('#active-place')!.textContent =
    `${activeMpio.name}, ${dept.name} (${activeStation.stationCode})`;
  root!.querySelector<HTMLElement>('#territory-caption')!.textContent =
    `${activeStation.name} · ${activeStation.tablesCount} mesas habilitadas`;
  root!.querySelector<HTMLElement>('#hero-dept-stamp')!.textContent = dept.name.slice(0, 14);
  root!.querySelector<HTMLElement>('#hero-mpio-stamp')!.textContent =
    `${activeMpio.name.slice(0, 12)} · ${activeMpio.code}`;

  detailBox.innerHTML = `
    <div class="reg-station-runner-head">
      <span class="reg-station-badge">📍 PUESTO DE VOTACIÓN ACTIVO</span>
      <span class="reg-station-code">${activeStation.stationCode} · ${activeStation.lat.toFixed(3)}°, ${activeStation.lon.toFixed(3)}°</span>
    </div>
    <h3>${activeStation.name}</h3>
    <p class="reg-station-address">
      <strong>${activeMpio.name} — ${dept.name}</strong> · ${activeStation.address}
    </p>
    <div class="reg-station-metrics">
      <span>🗳️ <strong>${activeStation.tablesCount}</strong> mesas instaladas</span>
      <span>👥 <strong>${activeStation.potentialVoters.toLocaleString('es-CO')}</strong> votantes habilitados</span>
    </div>
    <div class="reg-mechanism-picker" style="margin-bottom:.75rem;">
      <label for="quick-mechanism-select">Mecanismo de participación a ejecutar en este puesto:</label>
      <select id="quick-mechanism-select" class="reg-pill-select">
        ${votingMechanismTemplates
          .map(
            (t) =>
              `<option value="${t.template_id}" ${t.template_id === activeProc.templateId ? 'selected' : ''}>${t.name}</option>`,
          )
          .join('')}
      </select>
    </div>
    <div class="reg-station-actions">
      <a href="#vote-panel" id="btn-run-station-vote" class="reg-run-btn reg-run-btn-primary">
        ⚡ Iniciar / Correr Votación en este Puesto →
      </a>
      <a href="#processes-panel" class="reg-run-btn reg-run-btn-secondary">
        ⚙️ Configurar Reglas
      </a>
    </div>
  `;

  const quickMechSelect = detailBox.querySelector<HTMLSelectElement>('#quick-mechanism-select');
  if (quickMechSelect) {
    quickMechSelect.addEventListener('change', () => {
      ensureProcessForTerritory(dept.code, activeMpio.code, quickMechSelect.value);
      renderProcessesUI();
      recordLocalAudit(
        'Mecanismo ajustado en Puesto',
        `${quickMechSelect.value} en ${activeStation.name}`,
      );
    });
  }

  root!.querySelectorAll<HTMLButtonElement>('[data-territory]').forEach((button) => {
    const selected = button.dataset.territory === dept.code;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });

  if (refreshMap) {
    colombiaMap.refreshSelection(true);
  }
}

deptSelect.addEventListener('change', (ev) => {
  const deptCode = (ev.currentTarget as HTMLSelectElement).value;
  const { department, municipality } = selectDepartmentAndMunicipality(deptCode);
  ensureProcessForTerritory(department.code, municipality.code);
  syncDependentTerritorySelectors(true);
  renderProcessesUI();
});

mpioSelect.addEventListener('change', (ev) => {
  const mpioCode = (ev.currentTarget as HTMLSelectElement).value;
  const { departmentCode } = activeDivipolaCodes();
  const { department, municipality } = selectDepartmentAndMunicipality(departmentCode, mpioCode);
  ensureProcessForTerritory(department.code, municipality.code);
  syncDependentTerritorySelectors(true);
  renderProcessesUI();
});

stationSelect.addEventListener('change', (ev) => {
  const stCode = (ev.currentTarget as HTMLSelectElement).value;
  const { departmentCode, municipalityCode } = activeDivipolaCodes();
  selectDepartmentAndMunicipality(departmentCode, municipalityCode, stCode);
  ensureProcessForTerritory(departmentCode, municipalityCode);
  syncDependentTerritorySelectors(true);
  renderProcessesUI();
});

resetMapBtn.addEventListener('click', () => {
  selectDepartmentAndMunicipality('05', '05001');
  ensureProcessForTerritory('05', '05001');
  syncDependentTerritorySelectors(false);
  colombiaMap.resetWorldColombiaView();
  renderProcessesUI();
  recordLocalAudit('Vista de mapa restablecida', 'Mapa enfocado en Colombia y el mundo.');
});

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  if (q.length < 2) {
    searchResultsBox.innerHTML = '';
    return;
  }
  const matches = searchMunicipalities(q);
  if (matches.length === 0) {
    searchResultsBox.innerHTML = '<small class="muted">Sin coincidencias en Colombia ni consulados.</small>';
    return;
  }
  searchResultsBox.innerHTML = matches
    .slice(0, 10)
    .map(
      (item) =>
        `<button type="button" class="button-quiet search-pill" data-dept="${item.departmentCode}" data-mpio="${item.municipality.code}">[${item.municipality.code}] ${item.municipality.name} (${item.departmentName})</button>`,
    )
    .join(' ');
  searchResultsBox.querySelectorAll<HTMLButtonElement>('.search-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { department, municipality } = selectDepartmentAndMunicipality(
        btn.dataset.dept!,
        btn.dataset.mpio!,
      );
      ensureProcessForTerritory(department.code, municipality.code);
      syncDependentTerritorySelectors(true);
      renderProcessesUI();
      searchResultsBox.innerHTML = '';
      searchInput.value = '';
    });
  });
});

root.querySelectorAll<HTMLButtonElement>('[data-territory]').forEach((button) => {
  button.addEventListener('click', () => {
    selectTerritory(button.dataset.territory!);
    const { departmentCode, municipalityCode } = activeDivipolaCodes();
    ensureProcessForTerritory(departmentCode, municipalityCode);
    syncDependentTerritorySelectors(true);
    renderProcessesUI();
  });
});

function territoryAdminReady(code: string): boolean {
  try {
    const raw = import.meta.env.VITE_TERRITORY_ADMINS as string | undefined;
    const config = raw
      ? (JSON.parse(raw) as Record<
          string,
          { account?: string; signers?: string[]; threshold?: number }
        >)
      : {};
    const legacyAccount =
      code === 'CO-ANT-MED'
        ? (import.meta.env.VITE_ADMIN_ACCOUNT as string | undefined)
        : undefined;
    const legacySigners =
      code === 'CO-ANT-MED'
        ? (import.meta.env.VITE_ADMIN_SIGNERS as string | undefined)
            ?.split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : undefined;
    const item = config[code];
    const account = item?.account ?? legacyAccount;
    const signers = item?.signers ?? legacySigners ?? [];
    const threshold = Number(
      item?.threshold ??
        (code === 'CO-ANT-MED' ? import.meta.env.VITE_ADMIN_THRESHOLD ?? '5' : 5),
    );
    return Boolean(
      account &&
        /^G[A-Z2-7]{55}$/.test(account) &&
        threshold === 5 &&
        signers.length === 8 &&
        new Set(signers).size === 8 &&
        signers.every((signer) => /^G[A-Z2-7]{55}$/.test(signer)),
    );
  } catch {
    return false;
  }
}

function updateTerritoryReadiness(): void {
  for (const territory of territories.slice(0, 10)) {
    const ready = root!.querySelector<HTMLElement>(`[data-readiness="${territory.code}"]`);
    if (!ready) continue;
    const hasAdmins = territoryAdminReady(territory.code);
    ready.textContent = `Contrato pendiente · ${hasAdmins ? 'firmantes configurados' : 'firmantes 5-de-8 pendientes'}`;
  }
}

syncDependentTerritorySelectors();
updateTerritoryReadiness();

// ============================================================================
// Processes, Deliberative Proposals, Voting & Results UI Controller
// ============================================================================

const processSelect = root.querySelector<HTMLSelectElement>('#active-process-select')!;
const processDetailCard = root.querySelector<HTMLElement>('#process-detail-card')!;
const deliberativeBox = root.querySelector<HTMLElement>('#deliberative-flow-box')!;
const proposalsList = root.querySelector<HTMLUListElement>('#proposals-list')!;
const voteOptionSelect = root.querySelector<HTMLSelectElement>('#vote-option-select')!;
const resultsSummaryBox = root.querySelector<HTMLElement>('#results-summary-box')!;
const voteReceiptBox = root.querySelector<HTMLElement>('#vote-receipt-box')!;

function getActiveProcess(): LocalProcess {
  return processesStore.find((p) => p.id === activeProcessId) ?? processesStore[0];
}

function renderProcessesUI(): void {
  processSelect.innerHTML = processesStore
    .map(
      (p) =>
        `<option value="${p.id}" ${p.id === activeProcessId ? 'selected' : ''}>[${p.state.toUpperCase()}] ${p.title} (${p.municipalityName} · ${p.municipalityCode})</option>`,
    )
    .join('');

  const proc = getActiveProcess();
  const tpl = votingMechanismTemplates.find((t) => t.template_id === proc.templateId);

  processDetailCard.innerHTML = `
    <strong>${proc.title}</strong> <span class="tag tag-outline">${proc.state.toUpperCase()}</span><br/>
    <p style="margin:0.4rem 0;"><strong>Pregunta:</strong> ${proc.question}</p>
    <p class="small-note" style="margin:0.3rem 0;">${proc.description}</p>
    <small>
      <strong>Plantilla:</strong> ${proc.templateName} ·
      <strong>Ámbito:</strong> ${proc.scope.toUpperCase()} (${proc.municipalityName}, ${proc.departmentName} — DIVIPOLA ${proc.municipalityCode}) ·
      <strong>Umbral configurado:</strong> ${proc.thresholdPct}% sobre censo sintético (${proc.censusSize}) ·
      <strong>Regla:</strong> ${proc.majorityRule}
    </small>
    ${tpl ? `<p class="small-note" style="margin-top:0.4rem;"><em>Nota normativa/educativa:</em> ${tpl.educational_vs_legal_note}</p>` : ''}
  `;

  deliberativeBox.hidden = !proc.deliberative;
  if (proc.deliberative) {
    proposalsList.innerHTML = proc.proposals
      .map(
        (pr, idx) =>
          `<li><span>P${idx + 1}</span><div><strong>${pr.title}</strong> (${pr.author})<br/><small>${pr.summary}</small></div></li>`,
      )
      .join('');
  }

  voteOptionSelect.innerHTML = proc.options
    .map((opt) => `<option value="${opt}">${opt}</option>`)
    .join('');

  const participantsCount = proc.voterMarkers.size;
  const participationPct = Number(((participantsCount / Math.max(1, proc.censusSize)) * 100).toFixed(2));
  const thresholdMet = participationPct >= proc.thresholdPct;

  const talliesHtml = Object.entries(proc.tallies)
    .map(
      ([opt, count]) =>
        `<div class="info-row"><span class="info-icon">#</span><div><strong>${opt}</strong><small>${count} voto(s) registrado(s)</small></div></div>`,
    )
    .join('');

  resultsSummaryBox.innerHTML = `
    <p class="small-note">
      <strong>Participantes registrados:</strong> ${participantsCount} de ${proc.censusSize} (${participationPct}%) ·
      <strong>Umbral (${proc.thresholdPct}%):</strong> ${thresholdMet ? 'Alcanzado en simulación' : 'Pendiente de alcanzar'} ·
      <strong>Estado:</strong> ${proc.state.toUpperCase()}
    </p>
    ${talliesHtml}
  `;
}

processSelect.addEventListener('change', (ev) => {
  activeProcessId = (ev.currentTarget as HTMLSelectElement).value;
  renderProcessesUI();
});

root.querySelector<HTMLButtonElement>('#btn-add-proposal')!.addEventListener('click', () => {
  const proc = getActiveProcess();
  const titleInput = root!.querySelector<HTMLInputElement>('#proposal-title')!;
  const summaryInput = root!.querySelector<HTMLInputElement>('#proposal-summary')!;
  if (titleInput.value.trim().length < 4 || summaryInput.value.trim().length < 6) {
    voteReceiptBox.innerHTML =
      '<strong>Error de validación:</strong> Ingresa título y resumen motivado para inscribir la ponencia.';
    return;
  }
  proc.proposals.push({
    title: titleInput.value.trim(),
    summary: summaryInput.value.trim(),
    author: currentSession?.display_name ?? 'Participante Sintético',
  });
  titleInput.value = '';
  summaryInput.value = '';
  recordLocalAudit('Ponencia inscrita', `Proceso ${proc.id}`);
  renderProcessesUI();
});

root.querySelector<HTMLButtonElement>('#btn-local-vote')!.addEventListener('click', () => {
  const proc = getActiveProcess();
  if (!currentSession) {
    voteReceiptBox.innerHTML = '<strong>Rechazado:</strong> Inicia sesión antes de votar.';
    return;
  }
  if (!currentSession.eligible) {
    voteReceiptBox.innerHTML =
      '<strong>Rechazado:</strong> El rol actual (Auditor) tiene alcance de solo lectura y auditoría, no emite votos.';
    return;
  }
  const confirmedCheck = root!.querySelector<HTMLInputElement>('#confirm-vote-check')!.checked;
  if (!confirmedCheck) {
    voteReceiptBox.innerHTML =
      '<strong>Confirmación requerida:</strong> Marca la casilla de confirmación antes de emitir tu voto.';
    return;
  }
  if (proc.state !== 'open') {
    voteReceiptBox.innerHTML = `<strong>Rechazado:</strong> El proceso ${proc.id} está ${proc.state.toUpperCase()} y no admite nuevos votos.`;
    return;
  }
  const selectedOption = voteOptionSelect.value;
  if (!proc.options.includes(selectedOption)) {
    voteReceiptBox.innerHTML = '<strong>Rechazado:</strong> Opción inválida para este proceso.';
    return;
  }
  const marker = `${proc.id}:${currentSession.subject_id}`;
  if (proc.voterMarkers.has(marker)) {
    voteReceiptBox.innerHTML =
      '<strong>Rechazado (Voto Único):</strong> Este participante sintético ya registró su participación en este proceso.';
    return;
  }

  proc.voterMarkers.add(marker);
  proc.tallies[selectedOption] = (proc.tallies[selectedOption] ?? 0) + 1;
  const receiptId = `rcpt_${crypto.randomUUID().slice(0, 12)}`;
  const timestamp = new Date().toISOString();
  proc.receipts.push({ receiptId, confirmed: false, timestamp });

  voteReceiptBox.innerHTML = `
    <strong>Comprobante técnico emitido:</strong> <code>${receiptId}</code> ·
    Proceso: <code>${proc.id}</code> ·
    Estado en cadena: <em>Local verificado (pendiente de firma en Freighter Testnet)</em> ·
    Separación de privacidad: marcador de participación desacoplado de la boleta.
  `;
  recordLocalAudit('Participación registrada', `Proceso=${proc.id}, Recibo=${receiptId}`);
  renderProcessesUI();
});

root.querySelector<HTMLButtonElement>('#btn-create-process')!.addEventListener('click', () => {
  if (!currentSession || currentSession.role !== 'administrador') {
    message.textContent =
      'Acceso denegado: Solo el rol Administrador puede crear o abrir/cerrar procesos.';
    return;
  }
  const tplId = root!.querySelector<HTMLSelectElement>('#new-proc-template')!.value;
  const tpl =
    votingMechanismTemplates.find((t) => t.template_id === tplId) ??
    votingMechanismTemplates[0];
  const scope = root!.querySelector<HTMLSelectElement>('#new-proc-scope')!.value;
  const title = root!.querySelector<HTMLInputElement>('#new-proc-title')!.value.trim();
  const question = root!.querySelector<HTMLInputElement>('#new-proc-question')!.value.trim();
  const rawOptions = root!
    .querySelector<HTMLInputElement>('#new-proc-options')!
    .value.split(',')
    .map((o) => o.trim().toUpperCase().replace(/\s+/g, '_'))
    .filter(Boolean);
  const thresholdPct = Number(
    root!.querySelector<HTMLInputElement>('#new-proc-threshold')!.value || '0',
  );

  if (title.length < 4 || rawOptions.length < 2) {
    message.textContent = 'Configura un título válido y al menos dos opciones distintas.';
    return;
  }
  const options = [...new Set(rawOptions)];
  if (tpl.default_rules.blank_vote_enabled && !options.includes('VOTO_EN_BLANCO')) {
    options.push('VOTO_EN_BLANCO');
  }

  const { departmentCode, municipalityCode } = activeDivipolaCodes();
  const dept = getDepartmentByCode(departmentCode);
  const mpio = getMunicipalityByCode(municipalityCode);
  const newId = `proc-${municipalityCode}-${processesStore.length + 1}`;
  const tallies: Record<string, number> = {};
  for (const opt of options) tallies[opt] = 0;

  processesStore.unshift({
    id: newId,
    title,
    question,
    description: tpl.description,
    templateId: tpl.template_id,
    templateName: tpl.name,
    category: tpl.category,
    deliberative: tpl.deliberation_flow_required,
    departmentCode: dept.code,
    departmentName: dept.name,
    municipalityCode: mpio.code,
    municipalityName: mpio.name,
    scope,
    state: 'open',
    options,
    blankVoteEnabled: tpl.default_rules.blank_vote_enabled,
    maxSelections: tpl.default_rules.max_selections,
    censusSize: 50,
    thresholdPct,
    majorityRule: tpl.default_rules.required_majority_rule,
    tallies,
    voterMarkers: new Set(),
    proposals: [],
    receipts: [],
  });
  activeProcessId = newId;
  recordLocalAudit(
    'Proceso creado por Administrador',
    `${newId} (${tpl.template_id}) en ${mpio.name} [${mpio.code}]`,
  );
  renderProcessesUI();
});

root.querySelector<HTMLButtonElement>('#btn-toggle-process-state')!.addEventListener('click', () => {
  if (!currentSession || currentSession.role !== 'administrador') {
    message.textContent =
      'Acceso denegado: Solo el rol Administrador puede cambiar el estado de un proceso.';
    return;
  }
  const proc = getActiveProcess();
  proc.state = proc.state === 'open' ? 'closed' : 'open';
  recordLocalAudit('Cambio de estado de proceso', `${proc.id} -> ${proc.state.toUpperCase()}`);
  renderProcessesUI();
});

renderProcessesUI();
recordLocalAudit('Sistema inicializado', 'Catálogo DANE DIVIPOLA (1,122 municipios) y 12 mecanismos cargados.');

// ============================================================================
// Freighter & Stellar Soroban Testnet Integration (Preserved & Verified)
// ============================================================================

connectButton.addEventListener('click', async () => {
  message.textContent = 'Solicitando acceso a Freighter…';
  try {
    const [{ getAddress, getNetwork, isConnected, setAllowed }, { Networks }] = await Promise.all([
      import('@stellar/freighter-api'),
      import('@stellar/stellar-sdk/base'),
    ]);
    const status = await isConnected();
    if (!status.isConnected) throw new Error('No se detecta la extensión. Instala o activa Freighter.');
    const permission = await setAllowed();
    if (permission.error) throw new Error(permission.error.message);
    const [account, network] = await Promise.all([getAddress(), getNetwork()]);
    if (account.error) throw new Error(account.error.message);
    if (network.error) throw new Error(network.error.message);
    if (network.network !== 'TESTNET' || network.networkPassphrase !== Networks.TESTNET) {
      throw new Error(
        `Red actual: ${network.network}. Cambia Freighter a Stellar Testnet antes de continuar.`,
      );
    }
    if (!/^G[A-Z2-7]{55}$/.test(account.address)) {
      throw new Error('Freighter no devolvió una cuenta pública G válida.');
    }
    connectedAddress = account.address;
    root.querySelector<HTMLElement>('#account')!.textContent =
      `${connectedAddress.slice(0, 8)}…${connectedAddress.slice(-7)}`;
    root.querySelector<HTMLElement>('#wallet-state')!.textContent = 'Wallet conectada en Testnet.';
    connectButton.textContent = 'Wallet conectada';
    message.textContent = `Conectada en Testnet: ${connectedAddress}`;
    recordLocalAudit('Wallet Freighter conectada', 'Red Stellar Testnet verificada.');
  } catch (error) {
    connectedAddress = undefined;
    root.querySelector<HTMLElement>('#account')!.textContent = 'Sin wallet';
    connectButton.textContent = 'Conectar Freighter';
    const details = error instanceof Error ? error.message : 'No fue posible conectar Freighter.';
    root.querySelector<HTMLElement>('#wallet-state')!.textContent = details;
    message.textContent = details;
  }
});

async function transact(
  method: import('./stellar').DemoOperation,
  args: import('./stellar').DemoArg[],
  sourceAddress = connectedAddress,
  signerAddresses = sourceAddress ? [sourceAddress] : [],
) {
  const evidence = root!.querySelector<HTMLParagraphElement>('#evidence')!;
  if (!sourceAddress) throw new Error('Conecta primero una billetera Freighter de Testnet.');
  evidence.textContent = 'Simulando transacción y esperando firma en Freighter…';
  const { submitDemoOperation } = await import('./stellar');
  const result = await submitDemoOperation(sourceAddress, method, args, signerAddresses);
  evidence.classList.remove('evidence-empty');
  evidence.innerHTML = `<strong>Transacción confirmada en ledger</strong><a href="https://stellar.expert/explorer/testnet/tx/${result.hash}" target="_blank" rel="noreferrer">${result.hash} ↗</a><span>Fee: ${result.feeStroops} stroops · resource fee: ${result.resourceFeeStroops} stroops · CPU: ${result.cpuInstructions} · lectura/escritura: ${result.readBytes}/${result.writeBytes} bytes</span>`;
  message.textContent = `Transacción confirmada en Stellar Testnet: ${result.hash}`;
  recordLocalAudit('Transacción Stellar confirmada', `Método=${method}, Hash=${result.hash.slice(0, 12)}…`);
}

async function reportError(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : 'Firma cancelada o fallida.';
  }
}

async function adminAction(action: () => Promise<void>) {
  await reportError(async () => {
    const token = root!.querySelector<HTMLInputElement>('#admin-token')!.value;
    const code = root!.querySelector<HTMLInputElement>('#admin-otp')!.value.trim();
    await verifyAdminTotp(token, code);
    root!.querySelector<HTMLInputElement>('#admin-otp')!.value = '';
    root!.querySelector<HTMLInputElement>('#admin-token')!.value = '';
    const { getAdminSigningConfig } = await import('./stellar');
    const admin = getAdminSigningConfig(territoryInfo().code);
    if (!admin.account || !/^G[A-Z2-7]{55}$/.test(admin.account)) {
      throw new Error('Configura VITE_ADMIN_ACCOUNT con la cuenta G de administración multisig.');
    }
    if (
      admin.threshold !== 5 ||
      admin.signers.length !== 8 ||
      new Set(admin.signers).size !== 8 ||
      admin.signers.some((address) => !/^G[A-Z2-7]{55}$/.test(address))
    ) {
      throw new Error(
        `Configura para ${territoryInfo().name} una cuenta G y exactamente ocho firmantes G distintos en VITE_TERRITORY_ADMINS, con umbral 5.`,
      );
    }
    adminSource = admin.account;
    adminSigners = admin.signers.slice(0, admin.threshold);
    await action();
  });
}

let adminSource: string | undefined;
let adminSigners: string[] = [];
const adminTransact = (
  method: import('./stellar').DemoOperation,
  args: import('./stellar').DemoArg[],
) => transact(method, args, adminSource, adminSigners);

root.querySelector('#add-option')!.addEventListener('click', () =>
  adminAction(async () => {
    const { asSymbol } = await import('./stellar');
    const option = root.querySelector<HTMLInputElement>('#option')!.value.trim().toUpperCase();
    if (!/^[A-Z0-9_]{1,9}$/.test(option)) {
      throw new Error('Usa un identificador sintético de 1 a 9 caracteres.');
    }
    await adminTransact('add_option', [asSymbol(option)]);
  }),
);
root.querySelector('#authorize')!.addEventListener('click', () =>
  adminAction(async () => {
    const { asAddress } = await import('./stellar');
    const voter = root.querySelector<HTMLInputElement>('#voter')!.value.trim();
    if (!/^G[A-Z2-7]{55}$/.test(voter)) {
      throw new Error('Ingresa una dirección pública G... de Testnet.');
    }
    await adminTransact('authorize_voter', [asAddress(voter)]);
  }),
);
root.querySelector('#open')!.addEventListener('click', () =>
  adminAction(() => adminTransact('open', [])),
);
root.querySelector('#close')!.addEventListener('click', () =>
  adminAction(() => adminTransact('close', [])),
);
root.querySelector('#cast')!.addEventListener('click', () =>
  reportError(async () => {
    const { asAddress, asSymbol } = await import('./stellar');
    if (!connectedAddress) throw new Error('Conecta primero una billetera Freighter de Testnet.');
    const option = root.querySelector<HTMLInputElement>('#option')!.value.trim().toUpperCase();
    if (!/^[A-Z0-9_]{1,9}$/.test(option)) {
      throw new Error('Usa un identificador sintético de 1 a 9 caracteres.');
    }
    await transact('cast', [asAddress(connectedAddress!), asSymbol(option)]);
  }),
);
root.querySelector('#refresh')!.addEventListener('click', () =>
  reportError(async () => {
    const { readDemoValue } = await import('./stellar');
    if (!connectedAddress) throw new Error('Conecta primero Freighter.');
    const [status, total] = await Promise.all([
      readDemoValue(connectedAddress, 'status'),
      readDemoValue(connectedAddress, 'total_votes'),
    ]);
    const values = Array.isArray(status) ? status : [];
    root!.querySelector<HTMLElement>('#election-state')!.textContent = values[0]
      ? 'Abierta'
      : values[1]
        ? 'Cerrada'
        : 'Sin abrir';
    root!.querySelector<HTMLElement>('#total-votes')!.textContent = String(total);
    message.textContent = `Estado [abierta, cerrada]: ${JSON.stringify(status)} · votos registrados: ${String(total)}`;
  }),
);
root.querySelector('#result')!.addEventListener('click', () =>
  reportError(async () => {
    const { asSymbol, readDemoValue } = await import('./stellar');
    if (!connectedAddress) throw new Error('Conecta primero Freighter.');
    const option = root!.querySelector<HTMLInputElement>('#option')!.value.trim().toUpperCase();
    const count = await readDemoValue(connectedAddress, 'result', [asSymbol(option)]);
    root!.querySelector<HTMLElement>('#election-state')!.textContent =
      `Conteo ${option}: ${String(count)}`;
    message.textContent = `Conteo público de ${option}: ${String(count)}. No es voto secreto.`;
  }),
);
