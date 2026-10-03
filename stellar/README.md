# Stellar / Soroban

El contrato actual es un esqueleto: inicialización única, cuenta administradora y transiciones abrir/cerrar con autorización; todavía no comprueba elegibilidad ni produce un conteo verificable completo. No despliegues para elecciones reales.

## Laboratorio local

Prerequisitos: Stellar CLI, Rust con `wasm32v1-none`, Docker y Node.js.

```powershell
docker compose --profile stellar up -d
cd stellar/contracts/voting
stellar contract build
```

Completa primero las tarjetas KAN-002 y KAN-013 antes de desplegar. Configura una cuenta desechable de laboratorio en la red local o Testnet. Nunca guardes frases semilla ni claves en el repositorio. Para Testnet, apunta únicamente a la passphrase y RPC públicos de Testnet y verifica la red en la billetera.

La interfaz Freighter entrega un XDR firmado, pero este prototipo no lo envía a la red ni construye aún invocaciones verificadas. Circle, ocho perfiles, TOTP, WAF y biometría permanecen como investigación.

## Verificación de transacción

Al implementar envío, registra solo hash, red, contrato y enlace de explorador. Plantilla de Testnet: `https://stellar.expert/explorer/testnet/tx/<HASH>`; no publiques un enlace de contrato hasta confirmar despliegue. Stellar Testnet es reiniciable y su evidencia no es permanente.

El contrato es educativo: no implementa voto secreto y debe auditarse antes de cualquier uso real.
