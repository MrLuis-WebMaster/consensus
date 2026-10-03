import { getAddress, getNetwork, isConnected, setAllowed, signTransaction } from '@stellar/freighter-api';

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
  status: 'Preparación — el contrato no está desplegado desde esta interfaz',
  admins: ['Administración primaria (rol de laboratorio)', 'Auditoría (rol de laboratorio)', 'Deliberación (rol de laboratorio)', 'Registro (rol de laboratorio)'],
  options: ['Opción sintética A', 'Opción sintética B'],
};

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Falta #app en index.html');

root.innerHTML = `
  <header><p class="eyebrow">CONSENSUS · LABORATORIO EDUCATIVO</p><h1>Votación verificable en Stellar</h1>
    <p class="notice">Simulación para aprendizaje. No usar en elecciones oficiales. No ofrece voto secreto. Usa solo identidades y opciones ficticias.</p></header>
  <main class="layout">
    <section class="card"><p class="eyebrow">ESCENARIO PILOTO</p><h2>${demo.place}</h2>
      <dl><dt>Elección</dt><dd>${demo.name}</dd><dt>Red objetivo</dt><dd>${demo.network}</dd><dt>Estado</dt><dd>${demo.status}</dd></dl>
    </section>
    <section class="card"><p class="eyebrow">ROLES DE ADMINISTRACIÓN</p><ul>${demo.admins.map((admin) => `<li>${admin}</li>`).join('')}</ul>
      <p class="muted">Los nombres describen roles ficticios; no acreditan autoridad ni representan entidades públicas.</p>
    </section>
    <section class="card"><p class="eyebrow">BILLETERA DE PRUEBA</p><p id="wallet-state" aria-live="polite">Conecta Freighter configurada en Testnet para inspeccionar la cuenta.</p>
      <button id="connect" type="button">Conectar Freighter</button><button id="sign" type="button" disabled>Firmar XDR de prueba</button>
      <label for="xdr">XDR preparado por un flujo de contrato verificado</label><textarea id="xdr" rows="3" placeholder="Pega aquí el XDR de una transacción de Testnet"></textarea>
      <p class="muted">Revisa red, operación y destinatario en Freighter antes de aprobar. Esta interfaz no envía transacciones ni simula una firma.</p>
    </section>
    <section class="card"><p class="eyebrow">OPCIONES SINTÉTICAS</p><ul>${demo.options.map((option) => `<li>${option}</li>`).join('')}</ul>
      <p>Un voto publicado en cadena puede revelar la preferencia de la cuenta.</p><a href="https://stellar.expert/explorer/testnet" target="_blank" rel="noreferrer">Abrir explorador Stellar Testnet</a>
    </section>
  </main><footer>Circle, Django, TOTP, WAF y biometría están pendientes de evaluación y no se habilitan en este prototipo.</footer>`;

const message = root.querySelector<HTMLParagraphElement>('#wallet-state')!;
const signButton = root.querySelector<HTMLButtonElement>('#sign')!;
const connectButton = root.querySelector<HTMLButtonElement>('#connect')!;
let connectedAddress: string | undefined;

connectButton.addEventListener('click', async () => {
  message.textContent = 'Solicitando acceso a Freighter…';
  try {
    const status = await isConnected();
    if (!status.isConnected) throw new Error('No se detecta la extensión. Instala o activa Freighter.');
    const permission = await setAllowed();
    if (permission.error) throw new Error(permission.error.message);
    const [account, network] = await Promise.all([getAddress(), getNetwork()]);
    if (account.error) throw new Error(account.error.message);
    if (network.error) throw new Error(network.error.message);
    if (network.network !== 'TESTNET') throw new Error(`Red actual: ${network.network}. Cambia Freighter a Testnet antes de continuar.`);
    connectedAddress = account.address;
    message.textContent = `Conectada en Testnet: ${connectedAddress}`;
    signButton.disabled = false;
  } catch (error) {
    connectedAddress = undefined;
    signButton.disabled = true;
    message.textContent = error instanceof Error ? error.message : 'No fue posible conectar Freighter.';
  }
});

signButton.addEventListener('click', async () => {
  const xdr = root.querySelector<HTMLTextAreaElement>('#xdr')!.value.trim();
  if (!connectedAddress) return;
  if (!xdr) {
    message.textContent = 'Pega un XDR de Testnet preparado y revisado antes de solicitar una firma.';
    return;
  }
  try {
    const network = await getNetwork();
    if (network.network !== 'TESTNET') throw new Error('La billetera dejó de estar configurada en Testnet.');
    const result = await signTransaction(xdr, { networkPassphrase: network.networkPassphrase, address: connectedAddress });
    if (result.error) throw new Error(result.error.message);
    message.textContent = `Freighter devolvió un XDR firmado por ${result.signerAddress}. No se envió a la red.`;
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : 'Firma cancelada o fallida.';
  }
});
