# 16. Plan técnico de implementación

**Estado:** plan propuesto para revisión del equipo  
**Horizonte:** 6 semanas para el MVP educativo  
**Regla:** ninguna identidad, rostro, clave privada o voto real entra al repositorio.

## Decisión de arquitectura propuesta

Consensus es un laboratorio educativo para Stellar: contrato Soroban en Rust, cliente TypeScript/Freighter y un servicio off-chain Django que evalúa vectores numéricos sintéticos y verifica un OTP administrativo. Nginx distribuye solicitudes entre dos instancias Python y ModSecurity/OWASP CRS aplica reglas WAF delante del balanceador. Estos contenedores son servicios centralizados desplegados por el equipo; no son validadores Stellar ni quedan descentralizados por estar escritos en Rust. La descentralización del estado y ejecución del contrato la aporta la red Stellar.

**Estado entrega 2:** Medellín sigue como piloto visual; el catálogo de aplicación ahora presenta diez departamentos con capital, selector, estado de preparación y campos de configuración independientes para contrato y administradores. Ninguna de las diez instancias tiene aún contract ID o transacción publicados. El cliente construye, simula, firma y envía invocaciones a Testnet cuando se proporcionan el contrato, la cuenta territorial, ocho claves públicas y una wallet. Freighter es el proveedor funcional. No se verificó soporte Circle Wallets para firmar XDR Soroban en este flujo, por lo que Circle no se integra. Los ocho perfiles son firmantes de una cuenta multisig propuesta 5-de-8 por territorio; son administradores de aplicación, no validadores. Django/TOTP y WAF corren en un laboratorio local y no forman parte de la validación de voto on-chain. La puntuación Python es sintética y no procesa rostros.

```text
Navegador TypeScript
  ├─ controles administrativos de demo (token + Django/TOTP)
  ├─ WalletGateway + Stellar SDK
  └─ API de lectura/verificación
          │
          ├── Stellar Testnet → contrato Soroban/Rust: reglas y conteo
          └── OWASP CRS → Nginx → dos procesos Django
                    └── TOTP/score numérico sintético; no toma decisiones electorales
```

### Responsabilidad por tecnología

| Tecnología | Uso en Consensus | Fuera del MVP |
| --- | --- | --- |
| Stellar/Soroban | Estado replicado, reglas del contrato y transacciones públicas en Testnet | Mainnet y elecciones reales |
| Rust | Contrato Soroban: administración, opciones, autorizados, voto único y conteo | Ejecutar/administrar servidores Python |
| TypeScript | UI, SDK Stellar, Freighter, preparación/envío y evidencia | Guardar secretos en navegador |
| Python/Django | Score numérico sintético y verificación OTP para UI de demo | Reconocimiento facial o decidir/contar votos |
| PostgreSQL/SQLite | Persistencia mínima off-chain, si hace falta | Fuente de verdad del resultado |
| TOTP/Django | Filtro de conveniencia para controles administrativos de demo | Sustituir firma multisig Stellar o garantizar seguridad productiva |
| Docker, Nginx, OWASP CRS | Dos workers Python, balanceador y WAF local | Descentralizar los servicios o una operación productiva |
| Terraform | No configurado | Crear una red Stellar administrada |
| Docker, Nginx, OWASP CRS | Dos instancias Django tras balanceador y WAF, solo en laboratorio local | Descentralizar servidores o desplegar sin seguridad adicional |

## Contrato Soroban mínimo

El contrato actual crea una instancia por elección y territorio mediante `__constructor(admin, territory)`. Mantiene solo estado y datos sintéticos:

- `add_option`, `authorize_voter`, `open`, `close`.
- `cast(voter, option)` con cuenta autorizada, elección abierta y voto único.
- `status`, `total_votes`, `result` y eventos públicos.
- El administrador se protege con `require_auth`; se propone 5-de-8 al configurar la cuenta en Stellar. El cliente no puede crear ese umbral on-chain por sí solo.

El voto se diseñará como demostración verificable, no como voto secreto. Publicar en cadena una relación entre identidad y opción puede revelar la preferencia; por eso no se usarán personas reales.

## Privacidad y score numérico

No hay reconocimiento facial implementado: Django valida cuatro valores numéricos sintéticos y no acepta imágenes. La biometría no es requisito del MVP. Un experimento futuro requeriría evaluación de privacidad y seguridad separada. El flujo actual:

1. Enviar números sintéticos a Django para calcular una distancia de prueba.
2. Usar token + TOTP solo para habilitar acciones administrativas en la interfaz.
3. Mantener reglas y conteo en el contrato; el score no decide elegibilidad on-chain.
4. No enviar imágenes, score, OTP ni identificadores personales a Stellar.

El cifrado homomórfico y las pruebas de conocimiento cero se reservan para una investigación posterior. No se debe afirmar que una API facial o un hash proporcionan anonimato, anti-coerción o identidad legal.

## Entornos y medición de recursos

El equivalente educativo de Ganache no es otra cadena EVM: se usará `stellar container start local` (Stellar Quickstart con RPC), Stellar CLI y Stellar Lab. La prueba de una transacción se hará con `simulateTransaction`; se guardarán en `docs/evidence/` los recursos, `resourceFee`, versión del protocolo y fecha. Testnet servirá para la demostración compartida; Futurenet solo si una funcionalidad experimental lo exige.

Las tarifas de Soroban dependen de instrucciones, lecturas/escrituras, bytes, eventos y almacenamiento. Por ello no se publicará un “gas fijo”: cada escenario tendrá una medición reproducible y un presupuesto máximo definido por el equipo.

## Interfaz y hosting

El frontend mantiene el cliente TypeScript existente e incorpora la dirección visual del prototipo Replit (paleta cálida, fotografías adjuntas del territorio, navegación y paneles de actividad). No se importó el workspace React completo porque tiene dependencias Replit/pnpm y una interfaz Soroban distinta. En los archivos recibidos no aparece una URL ni exportación fuente Figma; KANBAN mantiene esa alineación pendiente.

Vercel publica únicamente la interfaz estática con `frontend/` como raíz; no despliega Rust, Soroban ni Django. La guía está en `frontend/DEPLOYMENT.md`. Hugging Face Spaces puede ejecutar el contenedor Django como Docker Space, pero una Space pública directa no incluye el WAF/limitador configurado en Compose; no publicar el endpoint TOTP allí hasta colocar protección externa y configurar CORS/hosts. Compose local sigue siendo la topología que combina Django x2, Nginx y OWASP CRS.

## AWS y operación (OPEX)

Amazon Managed Blockchain no aloja ni valida Stellar: AMB Access ofrece nodos de Ethereum/Bitcoin y AMB Networks usa Hyperledger Fabric. Para Consensus se mantendrá Stellar Quickstart local, Testnet o un RPC compatible de Stellar. AWS solo hospedará componentes auxiliares si el laboratorio lo necesita:

- S3/CloudFront o hosting estático para la UI.
- Lambda/API Gateway para endpoints de lectura muy pequeños.
- DynamoDB o RDS únicamente si se demuestra una necesidad off-chain.
- CloudWatch y AWS Budgets desde el primer despliegue.

**Presupuesto educativo:** USD 0 de infraestructura objetivo mientras se use local/Testnet y la cuenta tenga créditos/free tier elegibles. AWS no es “gratis por ser estudiante” automáticamente: la elegibilidad, duración, límites y servicios dependen de la cuenta. Se debe configurar una alerta de presupuesto de USD 5 y un límite mensual de USD 20; cualquier cifra real se anotará desde Billing después de medir.

Terraform describirá solo los recursos auxiliares de AWS. Kubernetes, Nginx y una base de datos administrada quedan fuera del MVP porque añaden coste y superficie operativa sin resolver una regla de votación.

## Plan por semanas y entregables

| Semana | Trabajo | Evidencia de terminado |
| --- | --- | --- |
| 1 | Rust/Soroban hello-world, TypeScript SDK, Quickstart local y elección de wallet | Spike reproducible y decisión ADR |
| 2 | Modelo de dominio y contrato mínimo | Tests Rust de estados, autorización y unicidad |
| 3 | Cliente TypeScript y flujo crear/abrir/votar/cerrar | Demo local de extremo a extremo |
| 4 | Verificador independiente, eventos y medición de recursos | Informe de `simulateTransaction` |
| 5 | API Python opcional, 2FA administrativo y revisión de amenazas | Datos sintéticos, secretos fuera del repo |
| 6 | Testnet, accesibilidad, documentación y despliegue auxiliar | Demo reproducible, matriz de aceptación y coste observado |

## Criterios de aceptación del MVP

- Un participante autorizado solo puede votar una vez.
- No se puede votar antes de abrir ni después de cerrar.
- Un tercero puede reconstruir el resultado usando el contrato y sus eventos.
- Las pruebas se ejecutan sin claves reales ni datos personales.
- La guía distingue claramente red local, Testnet y cualquier servicio AWS.
- El despliegue se puede destruir sin dejar recursos costosos activos.

## Fuentes técnicas consultadas

- [Stellar CLI y contenedores locales](https://developers.stellar.org/docs/tools/cli/stellar-cli)
- [Modos local, Testnet y Futurenet](https://developers.stellar.org/docs/tools/quickstart/network-modes)
- [Medición de tarifas y recursos Soroban](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering)
- [AWS Free Tier y créditos](https://aws.amazon.com/free/free-tier-faqs/)
- [Alcance de Amazon Managed Blockchain](https://docs.aws.amazon.com/managed-blockchain/latest/ethereum-dev/managed-blockchain-ethereum-overview.html)
