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
  <header><p class="eyebrow">CONSENSUS · LABORATORIO EDUCATIVO</p><h1>Votación verificable en Stellar</h1>
    <p class="notice">Simulación para aprendizaje. No usar en elecciones oficiales. No ofrece voto secreto. Usa solo identidades y opciones ficticias.</p></header>
  <main class="layout">
    <section class="card"><p class="eyebrow">ESCENARIO PILOTO</p><h2>${demo.place}</h2>
      <dl><dt>Elección</dt><dd>${demo.name}</dd><dt>Red objetivo</dt><dd>${demo.network}</dd><dt>Estado</dt><dd>${demo.status}</dd><dt>Territorio</dt><dd><select id="territory">${availableTerritories().map((code) => `<option value="${code}">${code}</option>`).join('')}</select></dd></dl>
    </section>
    <section class="card"><p class="eyebrow">ROLES DE ADMINISTRACIÓN</p><ul>${demo.admins.map((admin) => `<li>${admin}</li>`).join('')}</ul>
      <p class="muted">Los nombres describen roles ficticios; no acreditan autoridad ni representan entidades públicas.</p>
    </section>
    <section class="card"><p class="eyebrow">BILLETERA DE PRUEBA</p><p id="wallet-state" aria-live="polite">Conecta Freighter configurada en Testnet.</p>
      <button id="connect" type="button">Conectar Freighter</button><span id="account" class="muted"></span>
      <p class="muted">Revisa red y operación en Freighter antes de aprobar. El contrato valida cada firma.</p>
    </section>
    <section class="card"><p class="eyebrow">ADMINISTRACIÓN DE DEMO</p>
      <label for="admin-token">Token de demo (no lo guardes en el repo)</label><input id="admin-token" type="password" autocomplete="off" />
      <label for="admin-otp">OTP de autenticador</label><input id="admin-otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" />
      <label for="option">Opción sintética (A–H)</label><input id="option" maxlength="9" value="A" />
      <button id="add-option" type="button">Agregar opción</button><button id="open" type="button">Abrir elección</button><button id="close" type="button">Cerrar elección</button>
      <label for="voter">Cuenta ficticia habilitada (G...)</label><input id="voter" maxlength="56" placeholder="Dirección pública Testnet" />
      <button id="authorize" type="button">Habilitar cuenta</button><button id="cast" type="button">Votar con billetera conectada</button><button id="refresh" type="button">Actualizar estado</button><button id="result" type="button">Consultar conteo de opción</button>
      <p id="evidence" aria-live="polite">Sin transacciones registradas.</p>
    </section>
    <section class="card"><p class="eyebrow">OPCIONES SINTÉTICAS</p><ul>${demo.options.map((option) => `<li>${option}</li>`).join('')}</ul>
      <p>Un voto publicado en cadena puede revelar la preferencia de la cuenta.</p><a href="https://stellar.expert/explorer/testnet" target="_blank" rel="noreferrer">Abrir explorador Stellar Testnet</a>
    </section>
  </main><footer>El token + TOTP bloquea los botones administrativos de la demo. El contrato verifica un umbral 5-de-8 en la cuenta Stellar; no son validadores de consenso. Circle Wallets no ofrece Stellar; se usa Freighter. Solo se procesa puntuación numérica sintética: no reconocimiento facial real.</footer>`;

const message = root.querySelector<HTMLParagraphElement>('#wallet-state')!;
const connectButton = root.querySelector<HTMLButtonElement>('#connect')!;
let connectedAddress: string | undefined;
root.querySelector<HTMLSelectElement>('#territory')!.addEventListener('change', (event) => {
  const territory = (event.currentTarget as HTMLSelectElement).value;
  selectTerritory(territory);
  message.textContent = `Territorio ${territory}: ${activeContractId() ? 'contrato listo en Testnet' : 'falta configurar contrato de Testnet'}.`;
});

connectButton.addEventListener('click', async () => {
  message.textContent = 'Solicitando acceso a Freighter…';
  try {
    const { getAddress, getNetwork, isConnected, setAllowed } = await import('@stellar/freighter-api');
    const status = await isConnected();
    if (!status.isConnected) throw new Error('No se detecta la extensión. Instala o activa Freighter.');
    const permission = await setAllowed();
    if (permission.error) throw new Error(permission.error.message);
    const [account, network] = await Promise.all([getAddress(), getNetwork()]);
    if (account.error) throw new Error(account.error.message);
    if (network.error) throw new Error(network.error.message);
    if (network.network !== 'TESTNET') throw new Error(`Red actual: ${network.network}. Cambia Freighter a Testnet antes de continuar.`);
    connectedAddress = account.address;
    root.querySelector<HTMLSpanElement>('#account')!.textContent = connectedAddress;
    message.textContent = `Conectada en Testnet: ${connectedAddress}`;
  } catch (error) {
    connectedAddress = undefined;
    message.textContent = error instanceof Error ? error.message : 'No fue posible conectar Freighter.';
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
  evidence.innerHTML = `Confirmada: <a href="https://stellar.expert/explorer/testnet/tx/${result.hash}" target="_blank" rel="noreferrer">${result.hash}</a><br>Fee: ${result.feeStroops} stroops (resource fee: ${result.resourceFeeStroops}); CPU: ${result.cpuInstructions}; read/write: ${result.readBytes}/${result.writeBytes} bytes.`;
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
  message.textContent = `Estado [abierta, cerrada]: ${JSON.stringify(status)} · votos registrados: ${String(total)}`;
}));
root.querySelector('#result')!.addEventListener('click', () => reportError(async () => {
  const { asSymbol, readDemoValue } = await import('./stellar');
  if (!connectedAddress) throw new Error('Conecta primero Freighter.');
  const option = root!.querySelector<HTMLInputElement>('#option')!.value.trim().toUpperCase();
  const count = await readDemoValue(connectedAddress, 'result', [asSymbol(option)]);
  message.textContent = `Conteo público de ${option}: ${String(count)}. No es voto secreto.`;
}));
