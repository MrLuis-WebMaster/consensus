# Consensus

Laboratorio educativo de votación sintética para estudiar Stellar Soroban, firmas y evidencia verificable. El catálogo cubre diez departamentos; Medellín, Antioquia, es el piloto de interfaz. **No usar en elecciones oficiales o vinculantes: no ofrece voto secreto, no verifica identidad legal y todas las cuentas/opciones deben ser ficticias.**

## Estado actual

- La dapp TypeScript/Vite integra Freighter, Stellar SDK y operaciones Soroban simuladas, firmadas, enviadas y consultadas en **Testnet**, una vez configurado un contract ID.
- El contrato Rust/Soroban aplica reglas de opción, autorización, apertura/cierre, voto único y conteo; las pruebas unitarias corren en GitHub Actions.
- Django/Python ofrece TOTP para la interfaz de administración y una comparación numérica sintética. Docker Compose configura dos instancias Django tras Nginx `least_conn`, protegidas por OWASP CRS/ModSecurity.
- El diseño visual incorpora la dirección del prototipo Replit. El frontend actual conserva su cliente TypeScript, sin importar el workspace React/Replit completo. No se adjuntó archivo o URL fuente de Figma.
- **Aún no se ha desplegado el contrato ni publicado una transacción**; por eso no existe contract ID ni link de blockchain para este piloto. El WAF/Django están configurados para laboratorio local, no publicados.
- La interfaz ya muestra los diez departamentos, su capital, selección y estado de preparación de contrato y firmantes. Los diez siguen pendientes de credenciales y despliegues de Testnet; el catálogo no representa diez nodos validadores.

Los ocho administradores propuestos son perfiles de aplicación con un umbral objetivo 5-de-8; no son validadores de Stellar. Freighter es el firmante integrado. Circle no se presenta como wallet de Stellar. Rust descentraliza la ejecución del contrato al correr en la red Stellar; no descentraliza por sí mismo los servicios Django.

## Desarrollo local

Requisitos: Node.js 22, Rust >=1.84 con `wasm32v1-none`, Stellar CLI, Python 3.12 y Docker Compose.

```powershell
cd frontend
npm ci
npm run build
```

Para el backend local, copia `.env.example` a `.env`, define secretos nuevos y ejecuta:

```powershell
docker compose --profile lab up --build
```

Consulta [la guía Stellar](stellar/README.md) para construir/desplegar a Testnet, [el despliegue Vercel](frontend/DEPLOYMENT.md) para publicar solo la interfaz, y [KANBAN.md](KANBAN.md) para alcance, estados y dependencias. Configura contract ID y firmantes independientemente por departamento. Nunca guardes secretos en `.env.example`, Git, o variables `VITE_*`.

## Componentes

| Capa | Tecnología | Función |
| --- | --- | --- |
| Interfaz | TypeScript + Vite | Votación de prueba, administración, Freighter y evidencia |
| Blockchain | Rust + Soroban | Reglas y estado verificable en Stellar Testnet |
| Identidad de laboratorio | Python + Django + TOTP | Comprobación auxiliar; no determina el voto |
| Balanceo y protección | Nginx + OWASP CRS | Reverse proxy local hacia dos instancias Django |

## Documentación

- [Blueprint de entrega 2](docs/semana2/ProductBlueprint.md)
- [Wiki del laboratorio](docs/wiki/Home.md)
- [Tablero Kanban](KANBAN.md)
- [Plan técnico](docs/16-implementation-plan.md)
- [Guía de Stellar](stellar/README.md)
- [Guía de Vercel](frontend/DEPLOYMENT.md)
- [Guía Django Docker Space](encryption/biometric/README.md)
- [Formato de evidencia](docs/evidence/README.md)
- [Requisitos y aceptación](docs/11-requirements.md) · [plan de pruebas](docs/12-acceptance-test-plan.md)

El único enlace verificable de blockchain se agregará después de una transacción real confirmada en Testnet; el explorador genérico no representa un despliegue.
