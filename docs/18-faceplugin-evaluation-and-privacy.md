# 18. Evaluación Técnica, Legal y de Privacidad de FacePlugin SDK

**Candidata evaluada:** `https://github.com/Faceplugin-ltd/Open-Source-Face-Recognition-SDK`  
**Estado:** Evaluada e integrada mediante adaptador desacoplado (`FaceRecognitionProvider` en `encryption/biometric/lab/face_provider.py`).

---

## 1. Resultados de la Auditoría Técnica y de Licenciamiento

Antes de integrar la biblioteca propuesta como primera candidata, se inspeccionó el árbol completo del repositorio remoto (`README.md`, `requirements.txt`, `run.py` y los directorios `face_detect`, `face_feature`, `face_landmark`, `face_pose`, `face_util`):

| Criterio Evaluado | Hallazgo Verificado | Impacto en el MVP |
| --- | --- | --- |
| **1. Licencia del código fuente** | Aunque el `README.md` muestra una insignia `license: Open Source`, **el repositorio no contiene ningún archivo `LICENSE` ni cabeceras SPDX** en la raíz ni en los subdirectorios. | **Riesgo legal alto:** Bajo legislación de derechos de autor, la ausencia de una licencia explícita reserva todos los derechos por defecto. **No puede afirmarse que la biblioteca sea gratuita para cualquier uso** hasta contar con una licencia abierta explícita del titular (`Faceplugin-ltd`). |
| **2. Licencias de modelos y pesos** | Los pesos preentrenados incluidos en `face_detect`, `face_landmark`, `face_feature` y `face_pose` no documentan el conjunto de datos de entrenamiento ni la licencia de distribución de los modelos. | Se bloquea su activación automática salvo que el administrador defina explícitamente `FACEPLUGIN_LICENSE_REVIEWED=true` y `FACEPLUGIN_SDK_PATH`. |
| **3. Disponibilidad Windows y Linux** | Los scripts Python (`run.py`) utilizan `opencv-python` y `torch`, ejecutables en Windows y Linux x86_64. | Compatible a nivel de sistema operativo cuando las dependencias están instaladas. |
| **4. Compatibilidad con Python 3.12 y Docker** | `requirements.txt` del SDK fija `numpy==1.26.4`, `pillow==10.4.0`, `torch==2.4.1`, `torchaudio==2.4.1`, `torchvision==0.19.1` y `opencv-python`. Además, existe discrepancia entre el `README.md` (`from face_recognition_sdk import FaceRecognition`, módulo inexistente) y el punto de entrada real en `run.py` (`face_detect.detect_imgs.get_face_boundingbox`, `face_landmark.GetLandmark.get_face_landmark`, `face_feature.GetFeature.get_face_feature`). | Nuestro adaptador `FacePluginSdkProvider` se conecta a los módulos reales (`face_detect`, `face_landmark`, `face_feature`) cuando `FACEPLUGIN_SDK_PATH` está presente, sin inflar el contenedor base con ~2.5 GB de PyTorch cuando se ejecuta en modo de pruebas. |
| **5. Requisitos de CPU y memoria** | La carga simultánea de los modelos de detección, puntos faciales y extracción de características en PyTorch requiere ~1.5 GB – 2.5 GB de RAM y CPU con soporte AVX2. | Documentado para dimensionamiento de contenedores. |
| **6. Existencia de prueba de vida (*liveness*)** | A pesar de que la descripción del repositorio en GitHub menciona *Face Liveness Detection*, **el árbol público solo contiene `face_detect`, `face_landmark`, `face_feature`, `face_pose` y `face_util`**. No existe un módulo verificable de prueba de vida o *anti-spoofing* en el repositorio abierto. | `check_liveness()` reporta honestamente `supported=False, passed=False` con la razón técnica exacta (`liveness_not_supported_by_public_faceplugin_sdk`). |
| **7. Diferenciación 1:1 vs. 1:N** | El SDK extrae embeddings y calcula similitud entre pares. | El adaptador separa explícitamente `detect_faces`, `extract_features`, `compare_1to1` (permitido con consentimiento) e `identify_1toN` (bloqueado por política de privacidad con HTTP `403`). |

---

## 2. Controles de Privacidad y Cumplimiento (Ley 1581 de 2012 — Colombia)

En Colombia, los datos biométricos son **datos sensibles** (Art. 5 y Art. 6 de la Ley Estatutaria 1581 de 2012 y Decreto 1377 de 2013):

1. **Consentimiento informado previo y expreso:** Ninguna verificación facial se ejecuta sin haber aceptado previamente el consentimiento informado (`POST /v1/auth/biometric/consent`), el cual informa la finalidad educativa, la retención de `0 segundos` tras el cálculo y el endpoint de revocación inmediata (`POST /v1/auth/biometric/revoke`).
2. **Obligatoriedad de método alternativo:** Conforme a la prohibición de condicionar una actividad al suministro de datos sensibles, el usuario siempre puede completar el Paso 3 mediante el método alternativo autorizado (`POST /v1/auth/biometric/fallback`) sin activar la cámara.
3. **Prohibición de simular coincidencias reales:** Cuando `FacePlugin SDK` no está instalado, `FacePluginSdkProvider` devuelve `engine_enabled=False, matched=False, simulated=False` (`HTTP 503`) y **jamás simula una coincidencia biométrica ficticia como si fuera real**.
4. **Cero persistencia biométrica:** Ni imágenes ni vectores de características (`EphemeralFeatureVector`) se guardan en disco, SQLite, AWS S3, Stellar Testnet ni logs. Los arreglos en memoria se sobrescriben con ceros (`clear()`) inmediatamente después de calcular el coseno de similitud.
