# Consensus — Wiki del laboratorio

Consensus es una práctica educativa de votación comunitaria sobre Stellar. **No usar en elecciones oficiales/vinculantes.** No ofrece voto secreto ni certifica identidad, cargo público o autoridad legal. Todas las cuentas, personas y opciones del laboratorio son ficticias.

## Entrega actual: Medellín

Medellín, Antioquia, es el escenario piloto sintético de esta entrega. Los ocho perfiles propuestos son: administración primaria (analogía didáctica con Personería), auditoría (Contraloría), deliberación (Concejo), registro (Registraduría) y cuatro observadores sin atribución institucional. Son perfiles de aplicación, no validadores de Stellar. Esto no expresa jerarquía oficial, delegación, aval, control o participación real de esas entidades. El PDF del entregable no contiene procedimiento de firma ni jerarquía de Registraduría. Antes de atribuir funciones jurídicas o reproducir procedimientos de firma, el equipo debe consultar fuentes oficiales vigentes y obtener autorización pertinente. Freighter firma operaciones Stellar en el laboratorio; esa firma prueba control de una cuenta, no que el firmante pertenezca a Registraduría. Circle no está integrado como firmante. No se cargan firmas, nombres, cargos, documentos ni llaves reales.

## Territorio

El catálogo de escenarios de práctica contiene doce departamentos: Amazonas, Antioquia, Arauca, Atlántico, Bolívar, Boyacá, Caldas, Cauca, Chocó, Cundinamarca, Santander y Valle del Cauca. El modelo no implica instalación de doce nodos de consenso ni cubrimiento de todos los municipios. En la siguiente entrega se proyecta priorizar cinco de esos doce: Antioquia, Cundinamarca, Valle del Cauca, Atlántico y Santander; la lista es una propuesta pendiente de aprobación del equipo.

## Arquitectura y firmas

Cliente web TypeScript + SDK Stellar; contrato Soroban escrito en Rust; Stellar Quickstart local para desarrollo y Testnet para demo. El cliente puede simular, firmar con Freighter, enviar y consultar una invocación cuando exista un contrato configurado. **Todavía no se desplegó contrato ni se publicó transacción**, por lo que no hay contract ID o enlace de transacción. La administración está diseñada para 5 firmas de 8 cuentas públicas de prueba en una cuenta multisig Stellar. Configure ocho claves independientes y establezca los pesos/umbrales en Testnet antes de probar; son firmantes administrativos, no validadores de consenso. Las analogías con Personería, Contraloría, Concejo y Registraduría son exclusivamente didácticas y no atribuyen jerarquías, representación ni firmas oficiales.

Django valida un token de laboratorio y OTP TOTP para mostrar controles administrativos. Dos instancias Django reciben carga mediante Nginx `least_conn`, con OWASP CRS/ModSecurity como proxy frontal en Compose. Es infraestructura centralizada de laboratorio: Rust no descentraliza los servidores Python. Rust ejecuta las reglas del contrato en la red Stellar distribuida; Django procesa únicamente números sintéticos y TOTP, y no participa en la decisión ni conteo del voto. No hay reconocimiento facial. TOTP es un filtro de interfaz, no sustituye las firmas on-chain. Un Docker Space de Hugging Face queda preparado para score sintético solamente; no se deben exponer allí secretos de administración sin una capa WAF externa.

Freighter es el único firmante implementado. No se verificó soporte de Circle Wallets para firmar XDR Soroban en este flujo, por lo que Circle no se declara integrado. Circle Mint puede soportar activos de Stellar, pero eso no prueba que Circle Wallets firme operaciones Soroban. Las tarifas mostradas son `fee` y `resourceFee` de Stellar en stroops, más instrucciones y bytes simulados; “gas” es solo una analogía informal.

La interfaz ya incorpora fotografías de Medellín, Guatapé y el Valle de Aburrá recibidas para el diseño, con adaptación móvil y el prototipo React/Replit utilizado como referencia visual. El ZIP no incluye un archivo o URL fuente de Figma. La guía Vercel de `frontend/` publica la interfaz estática y no el contrato ni Django. Django tiene metadatos y contenedor para un Docker Space de score numérico; antes de ponerlo público con TOTP se requiere una protección WAF externa.

La fase siguiente propone cinco territorios de los doce modelados (Antioquia, Cundinamarca, Valle del Cauca, Atlántico y Santander), pendiente de aprobación del equipo. Se desplegará una instancia contractual por territorio y se añadirá su contract ID a `VITE_TERRITORY_CONTRACTS`; no se levantarán validadores propios por departamento.

## Enlaces del repositorio

- [Product Blueprint de la entrega 2](https://github.com/MrLuis-WebMaster/consensus/blob/main/docs/semana2/ProductBlueprint.md)
- [Tablero Kanban versionado](https://github.com/MrLuis-WebMaster/consensus/blob/main/KANBAN.md)
- [Plan técnico](https://github.com/MrLuis-WebMaster/consensus/blob/main/docs/16-implementation-plan.md)
- [Alcance y limitaciones](https://github.com/MrLuis-WebMaster/consensus/blob/main/docs/06-mvp-scope.md)
- [Registro de decisiones](https://github.com/MrLuis-WebMaster/consensus/blob/main/docs/13-decision-log.md)
- [Guía de despliegue Vercel](https://github.com/MrLuis-WebMaster/consensus/blob/main/frontend/DEPLOYMENT.md)
- [Guía de despliegue Django Docker Space](https://github.com/MrLuis-WebMaster/consensus/blob/main/encryption/biometric/README.md)
- [Explorador Stellar Testnet](https://stellar.expert/explorer/testnet)

La URL del explorador anterior es una entrada genérica; no representa un contrato desplegado. Registrar enlace concreto solo después de desplegar y verificar una transacción de prueba.
