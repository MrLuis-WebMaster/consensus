# Evidencia de Testnet

No hay aún evidencia de una publicación exitosa: el contrato no está desplegado y ninguna transacción se ha enviado. No inventes IDs, hashes, fees ni capturas.

Después de una operación confirmada, registra un archivo JSON por ejecución con:

```json
{
  "network": "TESTNET",
  "territory": "CO-ANT-MED",
  "contractId": "C...",
  "transactionHash": "hex hash confirmado",
  "explorerUrl": "https://stellar.expert/explorer/testnet/tx/<hash>",
  "operation": "open | add_option | authorize_voter | cast | close",
  "confirmedAtUtc": "ISO-8601 UTC",
  "feeStroops": "...",
  "resourceFeeStroops": "...",
  "cpuInstructions": 0,
  "readBytes": 0,
  "writeBytes": 0,
  "signerCount": 5,
  "notes": "Solo datos ficticios; no incluir direcciones personales, secretos ni datos de votantes"
}
```

Verifica el hash con el RPC y el explorador antes de registrar. Omite direcciones de firmantes y votantes para no asociar públicamente identidades con decisiones. `docs/evidence/*.json` está excluido de Git porque estos recibos pueden contener datos de red; comparte una copia saneada solo después de revisión del equipo.
