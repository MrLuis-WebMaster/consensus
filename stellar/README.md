# Stellar / Soroban · laboratorio de votación

Este laboratorio prepara un contrato de votación sintética para **Stellar Testnet**. A la fecha no se ha desplegado el WASM ni se ha publicado una transacción; por tanto, no hay un contract ID ni un hash de transacción que informar. No usar para elecciones oficiales, identidades reales o votos secretos.

## Componentes y responsabilidades

- **Soroban (Rust)** ejecuta las reglas de autorización, estado y conteo dentro de Stellar. Los validadores de Stellar replican el estado de la red; los ocho administradores de la aplicación no son nodos validadores.
- **Multifirma Stellar:** la propuesta es una cuenta administrativa 5-de-8. Ocho claves públicas distintas firman las operaciones administrativas y el umbral de la cuenta las autoriza. La interfaz solicita firmas Freighter secuenciales, cambiando la cuenta activa para cada firma. La configuración de cuenta y el contrato aún deben verificarse juntos en Testnet antes de usar.
- **Freighter** es el firmante de wallet implementado para la invocación Soroban.
- **Django** valida un token de laboratorio y OTP TOTP para habilitar controles de administración en la interfaz; esto es un filtro de conveniencia, no la autorización on-chain. El contrato y el umbral de Stellar siguen siendo la autoridad para operaciones administrativas.
- **Python** entrega una puntuación matemática con un vector numérico sintético, sin imágenes ni reconocimiento facial.
- **Dos instancias Django** quedan tras Nginx con balanceo `least_conn`; OWASP CRS/ModSecurity queda como proxy inverso con motor activo y límite de solicitudes. Compose configura un laboratorio local, no una publicación endurecida de producción.
- **Circle Wallets no está integrado:** la matriz oficial de redes soportadas no incluye Stellar. Circle Mint/USDC en Stellar no implica soporte de firma de transacciones Soroban. No se debe anunciar Circle como firma compatible hasta que Circle publique ese soporte.

## “Gas”, costos y evidencia

Stellar no usa gas EVM. La interfaz simula la invocación y muestra `fee` y `resourceFee` en stroops, instrucciones CPU y bytes de lectura/escritura. El `resourceFee` depende de los recursos de esa transacción; no hay tarifa fija configurada. Una transacción confirmada debe verificarse en el RPC y el explorador Testnet antes de compartir su enlace. No se inventan hashes, contratos ni recibos.

## Preparación local

Requisitos: Node.js compatible con el lockfile, Rust >=1.84, objetivo `wasm32v1-none`, Stellar CLI y Docker Compose. Para el servicio Python se recomienda Python 3.12.

1. Copia `.env.example` a `.env`, crea secretos nuevos para Django, `ADMIN_API_TOKEN` y `TOTP_SECRET`; no reutilices ni publiques secretos. La cuenta OTP puede inicializarse fuera del repositorio con PyOTP; entrega el URI de aprovisionamiento directamente al administrador, nunca en una issue o commit.
2. Instala dependencias del frontend con `npm ci` dentro de `frontend/` y configura `frontend/.env` a partir de `frontend/.env.example`. Mantén RPC en Testnet y completa `VITE_TERRITORY_CONTRACTS` únicamente con IDs `C...` comprobados.
3. En `stellar/contracts/voting`, compila el WASM con `stellar contract build` y ejecuta `cargo test` cuando Rust esté instalado.
4. Arranca los servicios del laboratorio con `docker compose --profile lab up --build`. Añade `--profile stellar` para iniciar Stellar Quickstart; verifica healthchecks y logs antes de conectar el cliente.
5. Para desplegar a Testnet, crea una cuenta de laboratorio, fúndela con Friendbot, y usa `stellar contract deploy --wasm target/wasm32v1-none/release/voting.wasm --source <ALIAS> --network testnet -- --admin <G_ADMIN> --territory CO-ANT-MED`. Guarda el ID que devuelva la CLI como `CO-ANT-MED` en el mapa JSON. La persona titular de la cuenta debe revisar y firmar el despliegue.
6. **Antes** de desactivar la clave maestra, verifica el contrato y administra su inicialización usando el firmante inicial. Luego añade ocho firmantes públicos de Testnet con peso 1 y configura umbrales low/med/high en 5; establece master weight en 0 solo después de comprobar que cinco claves independientes pueden firmar. Conserva un procedimiento seguro de recuperación para Testnet. No ejecutes comandos de cambio de signer sin revisar direcciones, umbral y cuenta destino.
7. Para votar, habilita cuentas ficticias, abre la elección y conecta Freighter en Testnet. Verifica cada operación en Stellar Expert Testnet antes de registrar su evidencia.

El contrato guarda identificadores de opción y conteos públicos: **no implementa privacidad, voto secreto, elegibilidad legal, resistencia a coerción o auditoría electoral**. Los eventos revelan actividad de cuentas. Usa solo escenarios y llaves desechables.

## Próximos departamentos

El contrato lleva un identificador de territorio inmutable, por ejemplo `CO-ANT-MED`. Para escalar el laboratorio no se clona la lógica: se despliega una instancia por territorio y se añade su par `territorio: contract ID` a `VITE_TERRITORY_CONTRACTS`. La siguiente fase contempla cinco territorios iniciales de los doce modelados, con lista sujeta a decisión del equipo. No se crean 12 validadores propios: todos usan la red Stellar.
