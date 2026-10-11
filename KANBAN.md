# Consensus · Kanban del laboratorio

Tablero de seguimiento del MVP. Las tarjetas no se marcan como terminadas hasta que exista validación y evidencia reproducible. El tablero versionado complementa GitHub Projects; no finge que ese Project remoto ya existe.

## Hecho y revisado

- [x] KAN-001 — Blueprint de la entrega 2 actualizado para Medellín, datos sintéticos, limitaciones y alcance territorial.
- [x] KAN-002 — Contrato Soroban Rust con administración, autorización, estados, voto único y conteos; pruebas unitarias pasan en GitHub Actions.
- [x] KAN-003 — Cliente TypeScript valida Testnet, simula, firma, envía y consulta operaciones del contrato configurado.
- [x] KAN-004 — Freighter integrado como wallet para firma en Testnet; soporte 5-de-8 en interfaz.
- [x] KAN-007 — Diez departamentos en el selector y catálogo; contrato y administración configurables por territorio.
- [x] KAN-008 — Roles descritos como perfiles didácticos sin atribución de autoridad a entidades públicas.
- [x] KAN-010 — Django implementa TOTP de demo y vector numérico sintético; dos réplicas Python detrás de Nginx y WAF OWASP CRS en Compose.
- [x] KAN-012 — Spike numérico sintético; no procesa rostros ni biometría.
- [x] KAN-016 — Wiki, blueprint, tablero y guía local actualizados para el laboratorio de diez departamentos y el piloto sintético de Medellín.
- [x] KAN-017 — Visual Replit adaptado al cliente TypeScript existente, con fotos locales, navegación y layout responsive.
- [x] KAN-019 — Configuración Vercel para `frontend/` con instalación reproducible y guía de variables públicas/secretos.
- [x] KAN-020 — Contenedor Django preparado para Docker Spaces con puerto configurable; la guía limita el uso público a datos sintéticos sin TOTP/WAF.

## En progreso

- [ ] KAN-018 — Alinear el diseño final con el archivo o enlace fuente de Figma; la entrega ZIP revisada no contiene exportación ni URL de Figma.

## Bloqueado por requisito externo

- [ ] KAN-005 — Circle como firmante Soroban requiere soporte oficial de firma Stellar; mantener Freighter como wallet operativa.
- [ ] KAN-006 — Desplegar contrato y publicar transacción Testnet requiere la CLI/herramientas de build y una cuenta Testnet firmante controlada por el equipo. No hay aún ID ni hash de red.
- [ ] KAN-009 — Provisionar ocho cuentas independientes y configurar/validar el umbral on-chain 5-de-8; la configuración de UI no sustituye `set-options` en Stellar.
- [ ] KAN-011 — Revisión de amenazas y endurecimiento previo a exponer Django/WAF públicamente; Compose es solo laboratorio.
- [ ] KAN-013 — Pruebas de integración end-to-end con wallet y contrato desplegado, pendientes de Testnet.
- [ ] KAN-014 — Migrar tarjetas a GitHub Projects cuando el token tenga permisos `project`.
- [ ] KAN-015 — Historias individuales de cada integrante deben ser redactadas/validadas por sus autores.

## Alcance territorial

Diez departamentos en el alcance de esta entrega: Antioquia (Medellín, piloto de interfaz), Cundinamarca (Bogotá), Valle del Cauca (Cali), Atlántico (Barranquilla), Santander (Bucaramanga), Bolívar (Cartagena), Boyacá (Tunja), Caldas (Manizales), Cauca (Popayán) y Chocó (Quibdó). Cada uno tiene su propio código, entrada seleccionable y espacio independiente para contract ID y cuenta/firmantes administradores. La interfaz no configura ni despliega esas cuentas: al corte, los diez contratos y los diez perfiles de administración siguen pendientes de credenciales y despliegue. Son escenarios de aplicación, no validadores propios; todas las instancias usarían Stellar Testnet.

## Definition of done

Cada feature necesita build/tests aplicables, aceptación documentada, registro de limitaciones y evidencia real. Nunca guardar semillas, claves privadas, OTP, datos faciales o votos reales en GitHub. Un enlace de Stellar Explorer solo se agrega tras confirmación de la transacción.
