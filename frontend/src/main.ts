import { activeContractId, availableTerritories, selectTerritory } from './territories';
import { verifyAdminTotp } from './identity';

type DemoElection = {
  name: string;
  place: string;
  network: string;
  status: string;
  admins: string[];
    options: string[];
};

const demo: DemoElection = {
  name: 'Elección comunitaria de demostración',
  place: 'Medellín, Antioquia (escenario sintético)',
  network: 'Stellar Testnet',
  status: activeContractId() ? 'Contrato configurado en Testnet' : 'Contrato pendiente de configuración',
  admins: [
    'Coordinación electoral (analogía didáctica: Personería)',
    'Observación de control (analogía didáctica: Contraloría)',
    'Observación deliberativa (analogía didáctica: Concejo)',
    'Observación registral (analogía didáctica: Registraduría)',
    'Administración técnica sintética',
    'Auditoría independiente sintética',
    'Observación de resultados sintética',
    'Gestión de incidentes sintética',
  ],
  options: ['Opción sintética A', 'Opción sintética B'],
};

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Falta #app en index.html');

root.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#overview" aria-label="Consensus inicio"><span class="brand-mark">C</span><span>CONSENSUS<small>LABORATORIO CÍVICO</small></span></a>
    <div class="topbar-right"><span class="network-pill"><i></i> STELLAR TESTNET</span><button id="connect" class="button button-dark" type="button">Conectar Freighter</button></div>
  </header>
  <main class="app-shell">
    <aside class="sidebar" aria-label="Navegación de la aplicación">
      <p class="eyebrow">ESPACIO DE TRABAJO</p>
      <a class="nav-link active" href="#overview"><span>01</span> Resumen</a>
      <a class="nav-link" href="#vote-panel"><span>02</span> Votación</a>
      <a class="nav-link" href="#admin-panel"><span>03</span> Administración</a>
      <a class="nav-link" href="#evidence-panel"><span>04</span> Evidencia</a>
      <div class="sidebar-note"><span class="live-dot"></span><div><strong>Red de prueba</strong><small>Datos ficticios · sin Mainnet</small></div></div>
    </aside>
    <div class="page-content">
      <section id="overview" class="hero-panel">
        <div class="hero-copy"><p class="eyebrow">CONSENSUS <span class="eyebrow-divider">/</span> ENTREGA 2</p>
          <h1>Votación verificable<br><em>en Stellar</em></h1>
          <p class="hero-description">Un laboratorio para explorar firmas, reglas on-chain y evidencia pública con identidades sintéticas.</p>
        </div>
        <div class="hero-stamp"><span>CO</span><strong>ANTIOQUIA</strong><small>ESCENARIO PILOTO</small></div>
        <div class="warning-banner"><span class="warning-icon">!</span><p><strong>Demostración educativa.</strong> No usar en elecciones oficiales. No ofrece voto secreto ni valida identidad legal; toda actividad de Stellar es pública.</p></div>
      </section>

      <section class="summary-grid" aria-label="Estado del laboratorio">
        <article class="summary-card"><span class="eyebrow">ELECCIÓN</span><strong>${demo.name}</strong><small>${demo.place}</small></article>
        <article class="summary-card"><span class="eyebrow">TERRITORIO</span><label class="sr-only" for="territory">Seleccionar territorio</label><select id="territory">${availableTerritories().map((code) => `<option value="${code}">${code}</option>`).join('')}</select><small>Siguiente fase: 5 de 12 territorios</small></article>
        <article class="summary-card"><span class="eyebrow">CONTRATO</span><strong id="contract-status" class="status-line"><i class="status-dot"></i>${demo.status}</strong><small>Sin despliegue publicado aún</small></article>
        <article class="summary-card"><span class="eyebrow">CUENTA CONECTADA</span><strong id="account">Sin wallet</strong><small id="wallet-state" aria-live="polite">Freighter es el firmante habilitado.</small></article>
      </section>

      <section class="place-gallery" aria-label="Medellín y Antioquia">
        <div class="gallery-heading"><div><p class="eyebrow">EL TERRITORIO</p><h2>Medellín y Antioquia</h2></div><p>Un piloto con raíces locales y datos totalmente ficticios.</p></div>
        <div class="gallery-grid">
          <figure class="place-card place-large"><img src="/images/medellin-valle.webp" alt="Panorámica urbana del Valle de Aburrá" /><figcaption><strong>Valle de Aburrá</strong><span>Medellín · Antioquia</span></figcaption></figure>
          <figure class="place-card"><img src="/images/medellin-plaza.webp" alt="Letras de Medellín en un espacio público arbolado" loading="lazy" /><figcaption><strong>Arte y ciudad</strong><span>Medellín</span></figcaption></figure>
          <figure class="place-card"><img src="/images/guatape-antioquia.webp" alt="La Piedra del Peñol y el paisaje de Guatapé" loading="lazy" /><figcaption><strong>Guatapé</strong><span>Antioquia</span></figcaption></figure>
          <figure class="place-card"><img src="/images/medellin-centro.webp" alt="Centro urbano de Medellín durante el atardecer" loading="lazy" /><figcaption><strong>Centro de Medellín</strong><span>Ciudad y patrimonio</span></figcaption></figure>
        </div>
      </section>

      <section id="vote-panel" class="workspace-grid">
        <article class="panel election-panel">
          <div class="panel-heading"><div><p class="eyebrow">01 / PARTICIPACIÓN</p><h2>Votación de prueba</h2></div><span class="tag tag-sand">Escenario sintético</span></div>
          <p class="muted">La cuenta conectada debe estar autorizada por el administrador. La cadena registra públicamente la opción elegida.</p>
          <label for="option">Código de opción</label><input id="option" maxlength="9" value="A" autocomplete="off" />
          <div class="button-row"><button id="cast" type="button">Firmar voto en Freighter</button><button id="refresh" class="button-quiet" type="button">Actualizar estado</button></div>
          <div class="result-strip"><div><span class="eyebrow">ESTADO ON-CHAIN</span><strong id="election-state">Aún sin consultar</strong></div><div><span class="eyebrow">VOTOS REGISTRADOS</span><strong id="total-votes">—</strong></div><button id="result" class="button-quiet" type="button">Consultar conteo</button></div>
        </article>
        <article class="panel network-panel">
          <div class="panel-heading"><div><p class="eyebrow">02 / INFRAESTRUCTURA</p><h2>Red y firmas</h2></div><span class="network-icon">✳</span></div>
          <div class="info-row"><span class="info-icon">◉</span><div><strong>Stellar Testnet</strong><small>Consenso y estado replicados por la red Stellar.</small></div></div>
          <div class="info-row"><span class="info-icon">⌘</span><div><strong>Rust · Soroban</strong><small>Reglas de autorización y conteo del contrato.</small></div></div>
          <div class="info-row"><span class="info-icon">◎</span><div><strong>Freighter · 5 de 8</strong><small>La UI facilita firmas; la cuenta debe tener multisig configurada on-chain.</small></div></div>
          <a class="text-link" href="https://stellar.expert/explorer/testnet" target="_blank" rel="noreferrer">Explorador Testnet <span>↗</span></a>
        </article>
      </section>

      <section id="admin-panel" class="workspace-grid admin-grid">
        <article class="panel admin-panel">
          <div class="panel-heading"><div><p class="eyebrow">03 / OPERACIÓN</p><h2>Administrar elección</h2></div><span class="tag tag-outline">Token + OTP</span></div>
          <p class="muted">El segundo factor solo protege los controles de esta demo. La autorización final ocurre con firmas Stellar.</p>
          <div class="form-grid"><div><label for="admin-token">Token de laboratorio</label><input id="admin-token" type="password" autocomplete="off" /></div><div><label for="admin-otp">Código de autenticador</label><input id="admin-otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" /></div></div>
          <div class="admin-actions"><button id="add-option" type="button">+ Agregar opción</button><button id="open" type="button">Abrir elección</button><button id="close" class="button-danger" type="button">Cerrar elección</button></div>
          <label for="voter">Cuenta ficticia que se autoriza</label><div class="inline-form"><input id="voter" maxlength="56" placeholder="Dirección pública G… de Testnet" autocomplete="off" /><button id="authorize" type="button">Autorizar</button></div>
        </article>
        <article class="panel roles-panel">
          <div class="panel-heading"><div><p class="eyebrow">04 / GOBERNANZA DE DEMO</p><h2>Ocho perfiles</h2></div><span class="role-count">08</span></div>
          <ul class="role-list">${demo.admins.map((admin, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span>${admin}</li>`).join('')}</ul>
          <p class="small-note">Son perfiles ficticios de aplicación, no nodos validadores ni representantes de entidades públicas.</p>
        </article>
      </section>

      <section id="evidence-panel" class="panel evidence-panel">
        <div class="panel-heading"><div><p class="eyebrow">05 / TRAZABILIDAD</p><h2>Actividad de red</h2></div><span class="tag tag-sand">Solo confirmaciones reales</span></div>
        <p id="evidence" aria-live="polite" class="evidence-empty">Todavía no hay contrato ni transacciones confirmadas. Las operaciones aparecerán aquí después de confirmarse en Testnet.</p>
      </section>
      <footer><strong>Stack del laboratorio</strong><span>TypeScript · Rust/Soroban · Django · Python · Nginx · OWASP CRS</span><p>Python procesa un vector numérico sintético; no se reciben imágenes ni se reconoce el rostro. Circle no es firmante de esta app. La API Python local no es una red descentralizada.</p></footer>
    </div>
  </main>`;

const message = root.querySelector<HTMLParagraphElement>('#wallet-state')!;
const connectButton = root.querySelector<HTMLButtonElement>('#connect')!;
let connectedAddress: string | undefined;
root.querySelector<HTMLSelectElement>('#territory')!.addEventListener('change', (event) => {
  const territory = (event.currentTarget as HTMLSelectElement).value;
  selectTerritory(territory);
  const status = root!.querySelector<HTMLElement>('#contract-status')!;
  status.innerHTML = `<i class="status-dot"></i>${activeContractId() ? 'Contrato configurado en Testnet' : 'Contrato pendiente de configuración'}`;
  message.textContent = `Territorio ${territory}: ${activeContractId() ? 'contrato listo en Testnet' : 'falta configurar contrato de Testnet'}.`;
});

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
      throw new Error(`Red actual: ${network.network}. Cambia Freighter a Stellar Testnet antes de continuar.`);
    }
    if (!/^G[A-Z2-7]{55}$/.test(account.address)) throw new Error('Freighter no devolvió una cuenta pública G válida.');
    connectedAddress = account.address;
    root.querySelector<HTMLElement>('#account')!.textContent = `${connectedAddress.slice(0, 8)}…${connectedAddress.slice(-7)}`;
    root.querySelector<HTMLElement>('#wallet-state')!.textContent = 'Wallet conectada en Testnet.';
    connectButton.textContent = 'Wallet conectada';
    message.textContent = `Conectada en Testnet: ${connectedAddress}`;
  } catch (error) {
    connectedAddress = undefined;
    root.querySelector<HTMLElement>('#account')!.textContent = 'Sin wallet';
    root.querySelector<HTMLElement>('#wallet-state')!.textContent = 'Freighter es el firmante habilitado.';
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
  evidence.innerHTML = `<strong>Transacción confirmada</strong><a href="https://stellar.expert/explorer/testnet/tx/${result.hash}" target="_blank" rel="noreferrer">${result.hash} ↗</a><span>Fee: ${result.feeStroops} stroops · resource fee: ${result.resourceFeeStroops} stroops · CPU: ${result.cpuInstructions} · lectura/escritura: ${result.readBytes}/${result.writeBytes} bytes</span>`;
  message.textContent = `Transacción confirmada en Stellar Testnet: ${result.hash}`;
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
    const admin = getAdminSigningConfig();
    if (!admin.account || !/^G[A-Z2-7]{55}$/.test(admin.account)) {
      throw new Error('Configura VITE_ADMIN_ACCOUNT con la cuenta G de administración multisig.');
    }
    if (admin.signers.length < admin.threshold || admin.signers.slice(0, admin.threshold).some((address) => !/^G[A-Z2-7]{55}$/.test(address))) {
      throw new Error(`Configura en VITE_ADMIN_SIGNERS al menos ${admin.threshold} direcciones G distintas, en orden de firma.`);
    }
    adminSource = admin.account;
    adminSigners = admin.signers.slice(0, admin.threshold);
    await action();
  });
}

let adminSource: string | undefined;
let adminSigners: string[] = [];
const adminTransact = (method: import('./stellar').DemoOperation, args: import('./stellar').DemoArg[]) =>
  transact(method, args, adminSource, adminSigners);

root.querySelector('#add-option')!.addEventListener('click', () => adminAction(async () => {
  const { asSymbol } = await import('./stellar');
  const option = root.querySelector<HTMLInputElement>('#option')!.value.trim().toUpperCase();
  if (!/^[A-Z0-9_]{1,9}$/.test(option)) throw new Error('Usa un identificador sintético de 1 a 9 caracteres.');
  await adminTransact('add_option', [asSymbol(option)]);
}));
root.querySelector('#authorize')!.addEventListener('click', () => adminAction(async () => {
  const { asAddress } = await import('./stellar');
  const voter = root.querySelector<HTMLInputElement>('#voter')!.value.trim();
  if (!/^G[A-Z2-7]{55}$/.test(voter)) throw new Error('Ingresa una dirección pública G... de Testnet.');
  await adminTransact('authorize_voter', [asAddress(voter)]);
}));
root.querySelector('#open')!.addEventListener('click', () => adminAction(() => adminTransact('open', [])));
root.querySelector('#close')!.addEventListener('click', () => adminAction(() => adminTransact('close', [])));
root.querySelector('#cast')!.addEventListener('click', () => reportError(async () => {
  const { asAddress, asSymbol } = await import('./stellar');
  if (!connectedAddress) throw new Error('Conecta primero una billetera Freighter de Testnet.');
  const option = root.querySelector<HTMLInputElement>('#option')!.value.trim().toUpperCase();
  if (!/^[A-Z0-9_]{1,9}$/.test(option)) throw new Error('Usa un identificador sintético de 1 a 9 caracteres.');
  await transact('cast', [asAddress(connectedAddress!), asSymbol(option)]);
}));
root.querySelector('#refresh')!.addEventListener('click', () => reportError(async () => {
  const { readDemoValue } = await import('./stellar');
  if (!connectedAddress) throw new Error('Conecta primero Freighter.');
  const [status, total] = await Promise.all([
    readDemoValue(connectedAddress, 'status'),
    readDemoValue(connectedAddress, 'total_votes'),
  ]);
    const values = Array.isArray(status) ? status : [];
    root!.querySelector<HTMLElement>('#election-state')!.textContent = values[0] ? 'Abierta' : values[1] ? 'Cerrada' : 'Sin abrir';
    root!.querySelector<HTMLElement>('#total-votes')!.textContent = String(total);
    message.textContent = `Estado [abierta, cerrada]: ${JSON.stringify(status)} · votos registrados: ${String(total)}`;
}));
root.querySelector('#result')!.addEventListener('click', () => reportError(async () => {
  const { asSymbol, readDemoValue } = await import('./stellar');
  if (!connectedAddress) throw new Error('Conecta primero Freighter.');
  const option = root!.querySelector<HTMLInputElement>('#option')!.value.trim().toUpperCase();
  const count = await readDemoValue(connectedAddress, 'result', [asSymbol(option)]);
  root!.querySelector<HTMLElement>('#election-state')!.textContent = `Conteo ${option}: ${String(count)}`;
  message.textContent = `Conteo público de ${option}: ${String(count)}. No es voto secreto.`;
}));
