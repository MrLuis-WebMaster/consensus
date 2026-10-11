# Publicar la interfaz en Vercel

El cliente puede publicarse como sitio estático. La configuración de Vercel está en esta carpeta; selecciona `frontend` como **Root Directory** del proyecto. Vercel ejecuta `npm ci`, `npm run build` y publica `dist/`. No hay que instalar el workspace de Replit ni ejecutar comandos desde el directorio raíz del repositorio.

## Variables de compilación

En Project Settings → Environment Variables, configura según el entorno:

| Variable | Uso | Pública en el navegador |
| --- | --- | --- |
| `VITE_STELLAR_RPC_URL` | RPC de Stellar Testnet; usa el endpoint predeterminado si se omite | Sí |
| `VITE_TERRITORY_CONTRACTS` | JSON `{ "CO-ANT-MED": "C..." }` con contract IDs comprobados | Sí |
| `VITE_ADMIN_ACCOUNT` | Dirección G de la cuenta multisig | Sí |
| `VITE_ADMIN_SIGNERS` | Direcciones públicas G de los firmantes | Sí |
| `VITE_ADMIN_THRESHOLD` | Umbral de firma, por ejemplo `5` | Sí |
| `VITE_IDENTITY_API_URL` | URL HTTPS pública del servicio Django detrás del WAF | Sí |

`VITE_*` se compila dentro de archivos accesibles por cualquier visitante. Son solo para endpoints e información pública. **Nunca agregues** API tokens, claves privadas, semilla de wallet, OTP o `TOTP_SECRET` aquí. Los secretos Django pertenecen al entorno privado del servicio Django.

Si no configuras un contrato, la app informa que no está desplegado y no inventa actividad de blockchain. Sin `VITE_IDENTITY_API_URL`, el navegador usa `http://localhost:8088`; eso sirve únicamente para desarrollo local, no para un deployment web compartido. La administración requiere una URL Django/WAF HTTPS con CORS para el dominio Vercel y una revisión de seguridad antes de abrirla a Internet. El usuario aporta su token de laboratorio y OTP; las acciones on-chain requieren aprobación de Freighter y los firmantes configurados.

## Comprobar antes de activar

1. Revisa `VITE_TERRITORY_CONTRACTS`, umbrales y claves públicas con los administradores del laboratorio.
2. Despliega primero una vista previa y prueba solo direcciones desechables de Stellar Testnet.
3. Confirma el entorno Testnet en Freighter, una operación de lectura y, solo con autorización de los administradores, una operación sintética firmada.
4. Comprueba hash y fees en Stellar Expert Testnet; no presentes una dirección de contrato hasta que el despliegue se confirme.

Esta publicación no despliega el contrato Rust ni el backend Django. El servicio de identidad debe publicarse por separado, detrás del WAF, y el despliegue Soroban debe seguir su procedimiento de Testnet.
