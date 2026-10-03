# Consensus — Wiki del laboratorio

Consensus es una práctica educativa de votación comunitaria sobre Stellar. **No usar en elecciones oficiales/vinculantes.** No ofrece voto secreto ni certifica identidad, cargo público o autoridad legal. Todas las cuentas, personas y opciones del laboratorio son ficticias.

## Entrega actual: Medellín

Medellín, Antioquia, es el escenario piloto sintético de esta entrega. Los ocho perfiles propuestos son: administración primaria (analogía didáctica con Personería), auditoría (Contraloría), deliberación (Concejo), registro (Registraduría) y cuatro observadores sin atribución institucional. Son perfiles de aplicación, no validadores de Stellar. Esto no expresa jerarquía oficial, delegación, aval, control o participación real de esas entidades. El PDF del entregable no contiene procedimiento de firma ni jerarquía de Registraduría. Antes de atribuir funciones jurídicas o reproducir procedimientos de firma, el equipo debe consultar fuentes oficiales vigentes y obtener autorización pertinente. Las firmas de Freighter/Circle prueban control de una cuenta sobre una transacción; no verifican que el firmante pertenezca a Registraduría. No se cargan firmas, nombres, cargos, documentos ni llaves reales.

## Territorio

El catálogo de escenarios de práctica contiene doce departamentos: Amazonas, Antioquia, Arauca, Atlántico, Bolívar, Boyacá, Caldas, Cauca, Chocó, Cundinamarca, Santander y Valle del Cauca. El modelo no implica instalación de doce nodos de consenso ni cubrimiento de todos los municipios. En la siguiente entrega se proyecta priorizar cinco de esos doce: Antioquia, Cundinamarca, Valle del Cauca, Atlántico y Santander; la lista es una propuesta pendiente de aprobación del equipo.

## Arquitectura y firmas

Cliente web TypeScript + SDK Stellar; contrato Soroban escrito en Rust; Stellar Quickstart local para desarrollo y Testnet para demo. Freighter es la billetera prioritaria para firma de XDR en navegador. La integración Circle queda en investigación hasta comprobar soporte oficial para firma Soroban en Stellar. Cualquier secreto de Circle permanece en servidor/gestor seguro. Ocho “nodos” del requerimiento se tratarán como perfiles administrativos de la aplicación; el consenso de Stellar no lo opera este proyecto. Para acciones compartidas se estudiará multisig y umbrales en una cuenta Stellar de prueba.

Django, TOTP (compatible con aplicaciones autenticadoras), WAF y reconocimiento facial son trabajo futuro. Biometría solo con datos sintéticos, fuera de la ruta de voto y jamás almacenada en cadena. TOTP protege acceso de demo, no el anonimato del voto.

## Enlaces del repositorio

- [Product Blueprint de la entrega 2](https://github.com/MrLuis-WebMaster/consensus/blob/main/docs/semana2/ProductBlueprint.md)
- [Tablero Kanban versionado](https://github.com/MrLuis-WebMaster/consensus/blob/main/KANBAN.md)
- [Plan técnico](https://github.com/MrLuis-WebMaster/consensus/blob/main/docs/16-implementation-plan.md)
- [Alcance y limitaciones](https://github.com/MrLuis-WebMaster/consensus/blob/main/docs/06-mvp-scope.md)
- [Registro de decisiones](https://github.com/MrLuis-WebMaster/consensus/blob/main/docs/13-decision-log.md)
- [Demo en Stellar Expert Testnet](https://stellar.expert/explorer/testnet)

La URL del explorador anterior es una entrada genérica; no representa un contrato desplegado. Registrar enlace concreto solo después de desplegar y verificar una transacción de prueba.
