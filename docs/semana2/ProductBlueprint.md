# Product Blueprint — Consensus (entrega 2)

**Versión:** laboratorio educativo · **Piloto:** Medellín, Antioquia · **Red:** Stellar Testnet · **Datos:** sintéticos

> Este prototipo no sirve para elecciones oficiales o vinculantes, no prueba identidad legal y no ofrece voto secreto. No representa ni compromete a entidades públicas.

## Priorización de historias

El backlog de esta entrega prioriza: (1) como votante de prueba quiero emitir un solo voto autorizado y consultar evidencia; (2) como operador quiero abrir y cerrar la elección con una cuenta administrativa; (3) como observador quiero verificar contrato, transacción y resultado; (4) como responsable del laboratorio quiero distinguir roles y firmas de cada administrador; (5) como integrante del equipo quiero reproducir la demo con datos sintéticos. Se prioriza integridad, trazabilidad y una demo verificable sobre biometría, despliegue gubernamental o escala. Las historias necesitan revisión del equipo y criterios por tarjeta antes de pasar a un GitHub Project.

## Propuesta de valor

Consensus permite a un equipo estudiar qué cambia cuando las reglas básicas de una votación comunitaria se ejecutan en Stellar y cualquier observador puede consultar su evidencia. En el piloto sintético de Medellín, participantes de prueba usan una billetera compatible con Stellar para firmar transacciones de Testnet; una interfaz TypeScript presenta los estados y enlaces verificables. Los roles administrativos se configuran para el ejercicio y quedan separados de los participantes. La experiencia hace visibles autorización, apertura, voto único, cierre y consulta, en lugar de pedir confianza ciega en una pantalla operada por una sola persona. El valor es pedagógico: practicar contratos Soroban, firmas, revisión y auditoría con límites explícitos. El prototipo no anonimiza votos, no valida cédulas o cargos, no sustituye procedimientos electorales ni implica participación de Personería, Contraloría, Concejo o Registraduría. Comparado con una simulación centralizada, añade estado y eventos públicos de prueba que terceros pueden inspeccionar; esos registros pueden exponer preferencias, por lo que solo se usan opciones e identidades ficticias. Una firma de billetera demuestra control de una cuenta para esa transacción, no la autoridad institucional de su titular.

## Flujo de usuario

1. El equipo inicia Stellar Quickstart local o selecciona Testnet y prepara cuentas ficticias.
2. Un administrador de demostración conecta Freighter y revisa el entorno antes de firmar una acción administrativa.
3. El operador configura opciones sintéticas y abre una sola elección; el contrato aplica autorización y estado.
4. Un votante de prueba conecta su cuenta, revisa que la red sea Testnet y firma un voto. El contrato rechaza votos no autorizados, duplicados o fuera de estado.
5. El operador cierra la elección y cualquier observador consulta estado, conteo y transacciones mediante Stellar Expert Testnet.
6. El equipo registra límites, fallos y evidencia en el repositorio. No se recolectan rostros, identificaciones, votos reales ni claves privadas.

Los administradores representan funciones de laboratorio, no titulares reales: administración primaria (analogía didáctica con Personería); perfiles ficticios de observación/auditoría (Contraloría), deliberación (Concejo) y registro (Registraduría); además, cuatro perfiles de observación sin atribución institucional. Son ocho perfiles propuestos, no ocho nodos de consenso. La jerarquía jurídica, facultades, nombramientos y firmas de Registraduría no se infieren ni se reproducen sin fuentes oficiales vigentes y autorización verificables. El PDF adjunto no incluye procedimiento de firma ni jerarquía institucional.

## Alcance del MVP

**Central:** elección sintética de Medellín; roles de demostración; cuenta administrativa con autorización; participante habilitado; voto único; abrir/cerrar; consulta de estado y evidencia Stellar; integración TypeScript y firma Freighter en red de prueba. El modelo contempla 12 departamentos colombianos para organizar escenarios, sin desplegar 12 elecciones ni nodos de consenso. “Nodo” aquí significa perfil administrativo de aplicación, no validador Stellar.

**Estado técnico de esta entrega:** el cliente TypeScript implementa simulación, firma Freighter, envío a Stellar Testnet, consulta del resultado y medición de fees/recursos, pero necesita un contract ID y cuentas Testnet configuradas. Aún no se desplegó contrato ni existe transacción publicada. El servicio Django valida OTP TOTP para habilitar los botones administrativos; esto no reemplaza la multisig ni una autenticación robusta de producción. El laboratorio tiene dos instancias Django tras Nginx `least_conn` y OWASP CRS delante. Python solo compara vectores numéricos ficticios: no recibe imágenes ni reconoce rostros. Circle Wallets no declara soporte de Stellar, así que no se ofrece como firmante. La administración propuesta es 5-de-8: ocho claves de prueba distintas, cinco firmas por acción. Son administradores de aplicación, no nodos validadores.

## Operación y siguiente fase

El primer despliegue de prueba será una instancia Soroban para `CO-ANT-MED`. Una vez que el equipo publique y verifique el contrato, asignará el contract ID al territorio en `VITE_TERRITORY_CONTRACTS`. En la siguiente fase se propone activar cinco territorios de los doce modelados (Antioquia, Cundinamarca, Valle del Cauca, Atlántico y Santander), sujeto a aprobación del equipo: cada territorio tendrá su instancia de contrato y cuenta/administradores configurados. Stellar ejecuta y replica el estado entre sus validadores; Rust implementa reglas deterministas para que la capa de Python no sea la fuente de verdad ni cargue el cómputo de consenso. La API Python permanece escalable horizontalmente como servicio de demo mediante las dos instancias y Nginx, sin afirmar que eso descentraliza los servidores.

Stellar no cobra “gas” de Ethereum. La interfaz muestra `fee` y `resourceFee` en stroops, instrucciones CPU y bytes de lectura/escritura devueltos por la simulación. Consultar [la guía del despliegue Testnet de Stellar](https://developers.stellar.org/docs/build/smart-contracts/getting-started/deploy-to-testnet) y [las tarifas y límites de recursos Soroban](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering). Los detalles reproducibles y los recibos confirmados irán en `docs/evidence/`; no se debe publicar una URL de transacción hasta que la red la confirme.

## Lean Canvas

| Bloque | Hipótesis de laboratorio |
|---|---|
| Problema | Difícil inspeccionar autorización, voto único y evidencia independiente en una demo centralizada. |
| Segmento | Estudiantes y equipos que aprenden blockchain y gobernanza. |
| Valor único | Simulación reproducible con eventos verificables y límites honestos. |
| Solución | Contrato Soroban, cliente TypeScript, billetera de prueba y verificador público. |
| Canales | Repositorio, demo de curso y documentación. |
| Métricas | Flujos reproducidos; reglas rechazadas/aceptadas; verificaciones independientes; pruebas aprobadas. |
| Ventaja | Trazabilidad entre decisiones, requisitos, pruebas y transacciones. |
| Costos/ingresos | Tiempo del equipo y recursos de Testnet; sin ingresos ni activos reales. |

## Backlog priorizado (Kanban)

Tablero versionado provisional: [KANBAN.md](../../KANBAN.md). El entregable del curso pide GitHub Projects; al corte de esta rama el token GitHub disponible no tiene alcance `read:project`, por eso no se afirma que exista o esté enlazado un Project remoto. Las tarjetas contienen aceptación y se deben migrar al Project del equipo al habilitar ese alcance. La siguiente entrega apunta a cinco departamentos de los doce modelados: Antioquia, Cundinamarca, Valle del Cauca, Atlántico y Santander (propuesta para aprobación del equipo; no despliegue confirmado).

## Arquitectura inicial

```text
Interfaz web TypeScript
  ├─ adaptador WalletGateway (Freighter/Testnet; Circle pendiente de compatibilidad)
  ├─ validación de red, construcción y lectura de transacciones
  └─ enlaces al explorador Stellar Expert Testnet
                 │ firma de cuenta / invocación Soroban
Contrato Rust/Soroban ─ estados, autorización y voto único
                 │
        RPC Stellar local / Testnet

Futuro aislado: Django + TOTP/WAF y experimentos faciales sintéticos,
fuera de la ruta de voto y sin imágenes/plantillas en la cadena.
```

TypeScript coordina interfaz y SDK; Rust ejecuta reglas deterministas del contrato; Stellar almacena el estado y eventos públicos de prueba. Los perfiles y TOTP off-chain no equivalen a validación de identidad. Ocho administradores no son ocho validadores de Stellar: Stellar mantiene su propio protocolo de consenso y este proyecto no opera una red de validadores. Una cuenta multifirma requiere configurar umbrales y claves en la cuenta Stellar y probarlas por separado; el texto del PDF no acredita firmas institucionales.

## Uso de Stellar y justificación

El contrato Soroban modela cambios de estado y rechazo de voto duplicado para que el grupo pueda inspeccionar reglas en una red de prueba. Rust es el entorno de contrato; el SDK TypeScript construye e invoca transacciones y la billetera pide consentimiento al firmante. Stellar RPC prepara, simula y envía la invocación. Horizon/operaciones y Stellar Expert Testnet permiten consultar evidencia pública y reproducir resultados. Quickstart local sirve para iteración segura; Testnet habilita revisión compartida con cuentas sin valor real. Esta arquitectura encaja con el objetivo de observar autorización y auditabilidad sin desplegar una cadena propia. Tiene un límite importante: un voto en cadena no es secreto y puede vincular cuenta y opción; tampoco resuelve coerción, dispositivos comprometidos ni la legitimidad de administradores. El estado y los datos son ficticios, y las URLs verificables se publican solo tras confirmación de transacción. No se despliega en Mainnet.

## Árbol de estructura

```text
consensus/
├── docs/semana2/ProductBlueprint.md
├── docs/semana2/<archivo individual de cada integrante>.md
├── docs/16-implementation-plan.md
├── KANBAN.md
├── frontend/                 # TypeScript / Stellar SDK
├── stellar/contracts/voting/ # Soroban / Rust
└── docs/wiki/                # borrador versionado para GitHub Wiki
```

El PDF requiere además una historia individual por integrante (5–7 historias y commit propio). No se crean archivos con nombres o autoría de compañeros sin su contenido; cada integrante debe aportar y confirmar el suyo.
