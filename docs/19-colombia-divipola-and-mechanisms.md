# 19. Catálogo Territorial DANE DIVIPOLA y Mecanismos de Participación en Colombia

**Estado:** implementado y validado automáticamente  
**Archivos fuente:**
- `data/territories/import_divipola.py`
- `data/territories/colombia_divipola.json`
- `data/territories/voting_mechanisms_colombia.json`

---

## 1. Catálogo Territorial Oficial DANE DIVIPOLA

El catálogo territorial no fue escrito a mano ni limitado a una lista parcial: se importa y valida automáticamente a partir del conjunto oficial **DIVIPOLA del DANE** publicado en Datos Abiertos de Colombia (`https://www.datos.gov.co/resource/gdxc-w37w.json`):

- **32 Departamentos** (Art. 298 Constitución Política).
- **Bogotá, Distrito Capital** (`cod_dpto: "11"`, `cod_mpio: "11001"`), con su tratamiento territorial especial conforme al Art. 322 de la Constitución Política y el Decreto Ley 1421 de 1993.
- **1,122 Municipios, Distritos Especiales, Isla y Áreas No Municipalizadas** con su código DIVIPOLA de 5 dígitos, relación jerárquica verificada con su departamento, nombre oficial, nombre normalizado sin diacríticos para búsqueda y hash SHA-256 de integridad (`f6bc2d5875a25c6b36ac6ca74fb7e0d385974f8619f1db57e122753f0c481443`).

### Regeneración y Validación Reproducible

```powershell
python data/territories/import_divipola.py
```

> **Advertencia legal:** El catálogo territorial delimita el ámbito de una simulación en Consensus (`nacional`, `departamental`, `distrital`, `municipal` u `organizacion`), pero **no constituye prueba de residencia ni de inscripción en el censo electoral**.

---

## 2. Plantillas Configurables de Procesos y Mecanismos de Participación

El archivo `data/territories/voting_mechanisms_colombia.json` define 12 plantillas configurables divididas en dos grandes categorías normativas y pedagógicas:

### Categoría A: Procesos Electorales Representativos
1. **`unipersonal`**: Elección de cargos unipersonales (contraste educativo con Arts. 190, 303 y 314 C.P.).
2. **`corporacion_lista_abierta`**: Corporaciones públicas con lista abierta y voto preferente (Art. 262 C.P.).
3. **`corporacion_lista_cerrada`**: Corporaciones públicas con lista cerrada y bloqueada sin voto preferente (Art. 262 C.P.).
4. **`interna_organizacion`**: Elecciones internas de organizaciones, juntas o comités con selección única o múltiple.
5. **`simulada_representantes`**: Elecciones simuladas de representantes estudiantiles o cívicos.

Incluye configuración explícita de **voto en blanco** (`VOTO_EN_BLANCO`), **voto no marcado** (`VOTO_NO_MARCADO`) y **voto nulo** (`VOTO_NULO`).

### Categoría B: Mecanismos de Participación Ciudadana (Ley 134 de 1994 y Ley Estatutaria 1757 de 2015)
6. **`plebiscito`**: Pronunciamiento convocado sobre una decisión del Ejecutivo.
7. **`referendo`**: Referendo aprobatorio o derogatorio de normas jurídicas.
8. **`consulta_popular`**: Pregunta de carácter general sobre un asunto de trascendencia nacional, departamental, distrital, municipal o local.
9. **`cabildo_abierto`**: Reunión pública deliberativa de concejos distritales/municipales o JAL. **No se reduce a una papeleta digital ni elige candidatos:** habilita flujo de inscripción de ponencias ciudadanas y respuesta motivada.
10. **`iniciativa_ciudadana`**: Iniciativa popular legislativa y normativa ante corporaciones públicas. **No es una elección de candidatos:** habilita radicación de propuestas normativas y recolección de apoyos sintéticos.
11. **`revocatoria_mandato`**: Simulación del mecanismo de terminación de mandato para gobernadores o alcaldes.
12. **`consulta_no_vinculante`**: Consultas internas y ejercicios de presupuesto participativo con selección múltiple.
