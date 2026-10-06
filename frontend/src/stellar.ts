import {
  BASE_FEE,
  Networks,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
} from '@stellar/stellar-sdk/base';
import { Api, Server, assembleTransaction } from '@stellar/stellar-sdk/rpc';
import { getAddress, getNetwork, signTransaction } from '@stellar/freighter-api';
import { activeContractId, activeTerritoryCode } from './territories';

const rpc = new Server(import.meta.env.VITE_STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org');
export type DemoOperation = 'add_option' | 'authorize_voter' | 'open' | 'cast' | 'close';
export type SubmissionEvidence = {
  hash: string;
  feeStroops: string;
  resourceFeeStroops: string;
  cpuInstructions: number;
  readBytes: number;
  writeBytes: number;
};
export type DemoArg = ReturnType<typeof nativeToScVal>;
const adminAccount = import.meta.env.VITE_ADMIN_ACCOUNT as string | undefined;
const configuredSigners = (import.meta.env.VITE_ADMIN_SIGNERS as string | undefined)
  ?.split(',').map((address) => address.trim()).filter(Boolean) ?? [];
const adminThreshold = Number(import.meta.env.VITE_ADMIN_THRESHOLD ?? '5');

export function configuredContract(): string | undefined {
  return activeContractId();
}

function ensureContract(): string {
  const contractId = activeContractId();
  if (!contractId) {
    throw new Error(`Configura un contrato de Testnet para ${activeTerritoryCode()} en VITE_TERRITORY_CONTRACTS.`);
  }
  return contractId;
}

export async function submitDemoOperation(
  sourceAddress: string,
  method: DemoOperation,
  args: ReturnType<typeof nativeToScVal>[],
  signerAddresses: string[] = [sourceAddress],
): Promise<SubmissionEvidence> {
  const id = ensureContract();
  const network = await getNetwork();
  if (network.error) throw new Error(network.error.message);
  if (network.network !== 'TESTNET' || network.networkPassphrase !== Networks.TESTNET) {
    throw new Error('Selecciona Stellar Testnet en Freighter antes de firmar.');
  }

  const source = await rpc.getAccount(sourceAddress);
  const unsigned = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.invokeContractFunction({ contract: id, function: method, args }))
    .setTimeout(60)
    .build();

  // Simulation populates the footprint and cost estimate before Freighter signs.
  const simulation = await rpc.simulateTransaction(unsigned);
  if (Api.isSimulationError(simulation)) throw new Error(`Simulación rechazada: ${simulation.error}`);
  const prepared = assembleTransaction(unsigned, simulation).build();
  const resources = simulation.transactionData.build().resources;
  let signedXdr = prepared.toXDR();
  const threshold = sourceAddress === adminAccount ? adminThreshold : 1;
  if (threshold < 1 || signerAddresses.length < threshold) {
    throw new Error('Configura la cuenta administrativa y al menos el umbral requerido de firmantes.');
  }
  const signedBy = new Set<string>();
  for (const expectedSigner of signerAddresses.slice(0, threshold)) {
    if (signedBy.size > 0 && !window.confirm(`Firma ${signedBy.size + 1}/${threshold}: cambia Freighter a la siguiente cuenta de administrador y confirma.`)) {
      throw new Error('Firma de administrador cancelada.');
    }
    const active = await getAddress();
    if (active.error) throw new Error(active.error.message);
    if (active.address !== expectedSigner) {
      throw new Error(`Selecciona en Freighter el firmante configurado ${expectedSigner}.`);
    }
    if (signedBy.has(active.address)) throw new Error('Cada firma debe proceder de una cuenta distinta.');
    const signed = await signTransaction(signedXdr, {
      networkPassphrase: network.networkPassphrase,
      address: active.address,
    });
    if (signed.error) throw new Error(signed.error.message);
    if (signed.signerAddress !== active.address) throw new Error('Freighter devolvió una dirección firmante distinta.');
    signedXdr = signed.signedTxXdr;
    signedBy.add(active.address);
  }

  const envelope = TransactionBuilder.fromXdr(signedXdr, Networks.TESTNET);
  const submitted = await rpc.sendTransaction(envelope);
  if (submitted.status === 'ERROR') {
    throw new Error(`Stellar RPC rechazó la transacción (${submitted.hash}).`);
  }
  const final = await rpc.pollTransaction(submitted.hash, { attempts: 30 });
  if (final.status === Api.GetTransactionStatus.FAILED) {
    throw new Error(`La transacción falló en ledger (${submitted.hash}).`);
  }
  if (final.status !== Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`La transacción sigue pendiente; verifica ${submitted.hash} en el explorador.`);
  }
  return {
    hash: submitted.hash,
    feeStroops: prepared.fee,
    resourceFeeStroops: simulation.minResourceFee,
    cpuInstructions: resources.instructions,
    readBytes: resources.diskReadBytes,
    writeBytes: resources.writeBytes,
  };
}

export async function readDemoValue(
  signerAddress: string,
  method: 'status' | 'total_votes' | 'result',
  args: ReturnType<typeof nativeToScVal>[] = [],
): Promise<unknown> {
  const id = ensureContract();
  const network = await getNetwork();
  if (network.error) throw new Error(network.error.message);
  if (network.network !== 'TESTNET' || network.networkPassphrase !== Networks.TESTNET) {
    throw new Error('Selecciona Stellar Testnet en Freighter para consultar.');
  }
  const source = await rpc.getAccount(signerAddress);
  const transaction = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.invokeContractFunction({ contract: id, function: method, args }))
    .setTimeout(30)
    .build();
  const simulation = await rpc.simulateTransaction(transaction);
  if (Api.isSimulationError(simulation)) throw new Error(simulation.error);
  return scValToNative(simulation.result!.retval);
}

export const asAddress = (value: string) => nativeToScVal(value, { type: 'address' });
export const asSymbol = (value: string) => nativeToScVal(value, { type: 'symbol' });
export const getAdminSigningConfig = () => ({ account: adminAccount, signers: configuredSigners, threshold: adminThreshold });
