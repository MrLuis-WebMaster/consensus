# Consensus — Kanban entrega 2

Backlog versionado para el laboratorio. El PDF solicita GitHub Projects; el acceso actual de GitHub no incluye `read:project`, así que este archivo es la vista reproducible y no pretende ser un tablero remoto ya creado. Crear/migrar al Project del equipo cuando el propietario habilite alcance Projects. Criterios de terminado: aceptación documentada, validación, evidencia y revisión.

## Por hacer

- [ ] KAN-001 — Alinear Product Blueprint con la rúbrica en `docs/semana2/ProductBlueprint.md`; validar historias priorizadas con el equipo.
- [ ] KAN-005 — Revisar Circle solo si el proveedor incorpora soporte firmado/documentado para XDR Soroban en Stellar; actualmente Circle no está implementado como wallet de esta dapp.
- [ ] KAN-006 — Desplegar demo sintética Medellín en Stellar Testnet y registrar direcciones, hash y enlaces al explorador, sin claves.
- [ ] KAN-007 — Modelar 12 departamentos como escenarios de laboratorio; preparar alcance siguiente para Antioquia, Cundinamarca, Valle, Atlántico y Santander, sujeto a aprobación.
- [ ] KAN-008 — Definir roles de administración/auditoría de demo y verificar autoridades/fuentes antes de atribuir facultades a entidades reales.
- [ ] KAN-009 — Provisionar en Testnet las ocho cuentas de firma e instalar/validar el umbral 5-de-8 con wallets controladas por el equipo.
- [ ] KAN-011 — Revisar amenazas y endurecer el WAF/Django antes de cualquier despliegue público; la configuración actual es solo laboratorio local.
- [ ] KAN-013 — Añadir pruebas de contrato, cliente e integración; vincular cada caso con RF/PA y evidencia repetible.
- [ ] KAN-014 — Migrar tarjetas a GitHub Projects con estados, responsables, aceptación y enlace desde el Blueprint.
- [ ] KAN-015 — Recolectar historias individuales (5–7 por integrante, commit de autoría propio) sin atribuirlas a terceros.

## En revisión

- [ ] KAN-002 — Contrato Soroban: administración, estados, autorización de votante, voto único y conteo; pruebas Rust pendientes de CI, Rust no instalado localmente.
- [ ] KAN-003 — Cliente TypeScript simula, firma, envía, consulta y presenta hash y costos de transacción; build local exitoso.
- [ ] KAN-004 — Firma Freighter Testnet con comprobación de red y soporte del umbral 5-de-8 en interfaz.
- [ ] KAN-010 — Django + token y OTP TOTP, vector numérico sintético, dos instancias y Nginx de balanceo.
- [ ] KAN-012 — Spike numérico sintético sin imágenes ni rostros; no implica reconocimiento biométrico.
- [ ] KAN-016 — Preparar esta entrega y demo Medellín con identidades y opciones ficticias.

## Bloqueado por requisito externo

- [ ] KAN-006 — Desplegar contrato y publicar transacción Testnet: requiere Stellar CLI/Rust instalados y una cuenta de laboratorio controlada por el equipo. No se han fabricado direcciones, hashes ni evidencias.
- [ ] KAN-014 — Crear tablero GitHub Projects remoto: el token disponible no tiene alcance `project`; KANBAN versionado queda como tablero de respaldo.

## Hecho

<!-- Marcar únicamente tarjetas implementadas y verificadas por el equipo. -->

## Alcance territorial

Se modelan 12 departamentos de Colombia: Amazonas, Antioquia, Arauca, Atlántico, Bolívar, Boyacá, Caldas, Cauca, Chocó, Cundinamarca, Santander y Valle del Cauca. Es un catálogo sintético de escenarios, no cobertura electoral ni datos de municipios. Entrega actual: Medellín, Antioquia. Siguiente entrega propuesta: Antioquia, Cundinamarca, Valle del Cauca, Atlántico y Santander; cinco de los doce, sujetos a confirmación del equipo.
