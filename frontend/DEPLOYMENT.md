# Publicar la interfaz en Vercel

El cliente puede publicarse como sitio estático. La configuración de Vercel está en esta carpeta; selecciona `frontend` como **Root Directory** del proyecto. Vercel ejecuta `npm ci`, `npm run build` y publica `dist/`. No hay que instalar el workspace de Replit ni ejecutar comandos desde el directorio raíz del repositorio.

## Variables de compilación

En Project Settings → Environment Variables, configura según el entorno:

| Variable | Uso | Pública en el navegador |
| --- | --- | --- |
| `VITE_STELLAR_RPC_URL` | RPC de Stellar Testnet; usa el endpoint predeterminado si se omite | Sí |
| `VITE_TERRITORY_CONTRACTS` | Mapa JSON de los códigos territoriales a contract IDs `C...` ya desplegados y comprobados | Sí |
| `VITE_TERRITORY_ADMINS` | Mapa JSON de administradores por territorio: cuenta G, lista de ocho firmantes G y umbral 5 | Sí |
| `VITE_ADMIN_ACCOUNT` | Dirección G de la cuenta multisig | Sí |
| `VITE_ADMIN_SIGNERS` | Direcciones públicas G de los firmantes | Sí |
| `VITE_ADMIN_THRESHOLD` | Umbral de firma, por ejemplo `5` | Sí |
| `VITE_IDENTITY_API_URL` | URL HTTPS pública del servicio Django detrás del WAF | Sí |

`VITE_*` se compila dentro de archivos accesibles por cualquier visitante. Son solo para endpoints e información pública. **Nunca agregues** API tokens, claves privadas, semilla de wallet, OTP o `TOTP_SECRET` aquí. Los secretos Django pertenecen al entorno privado del servicio Django.

Ejemplo de formato (direcciones de marcador, no funcionales):

```dotenv
VITE_TERRITORY_CONTRACTS={"CO-ANT-MED":"C..."}
VITE_TERRITORY_ADMINS={"CO-ANT-MED":{"account":"G...","signers":["G...1","G...2","G...3","G...4","G...5","G...6","G...7","G...8"],"threshold":5}}
```

Cada territorio necesita su propio par de configuración. La app exige ocho direcciones públicas distintas y umbral 5 para habilitar administración. El deploy y la cuenta también deben configurarse con esas claves; agregarlas a variables no configura la multifirma on-chain.

Si no configuras un contrato, la app informa que no está desplegado y no inventa actividad de blockchain. Sin `VITE_IDENTITY_API_URL`, el navegador usa `http://localhost:8088`; eso sirve únicamente para desarrollo local, no para un deployment web compartido. La administración requiere una URL Django/WAF HTTPS con CORS para el dominio Vercel y una revisión de seguridad antes de abrirla a Internet. El usuario aporta su token de laboratorio y OTP; las acciones on-chain requieren aprobación de Freighter y los firmantes configurados.

## Comprobar antes de activar

1. Revisa `VITE_TERRITORY_CONTRACTS`, `VITE_TERRITORY_ADMINS`, umbrales y claves públicas con los administradores del laboratorio. Configura cada territorio por separado; no reutilices autoridades de Antioquia.
2. Despliega primero una vista previa y prueba solo direcciones desechables de Stellar Testnet.
3. Confirma el entorno Testnet en Freighter, una operación de lectura y, solo con autorización de los administradores, una operación sintética firmada.
4. Comprueba hash y fees en Stellar Expert Testnet; no presentes una dirección de contrato hasta que el despliegue se confirme.

Esta publicación no despliega el contrato Rust ni el backend Django. El servicio de identidad debe publicarse por separado, detrás del WAF, y el despliegue Soroban debe seguir su procedimiento de Testnet.
