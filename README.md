# La Caja — Control Financiero 2026

Dashboard financiero personal + bot de registro por Telegram. Parte de **Proyecto Independizarme** (mudanza oct/nov 2026).

> Nota de marco: este repo es infraestructura de soporte (mejora de mantenibilidad del dashboard/bot), no mapea directamente contra ninguna de las 3 capas del proyecto (Deuda Cero / Pozo Mudanza / Ejecución). Se mantiene como herramienta auxiliar.

## Estructura

```
la-caja/
├── public/              → Dashboard (HTML/CSS/JS estático, sin build)
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── data.json        → datos actuales (423 movs, Ene-Jun 2026)
├── scripts/
│   ├── ContaBot.gs       → Apps Script del bot de Telegram
│   └── update_data.py    → CSV del Sheet → public/data.json
└── docs/                 → notas y decisiones
```

## Dashboard (`public/`)

Estático, sin dependencias de build. Carga `data.json` por `fetch` al iniciar.
Chart.js y SheetJS vienen de cdnjs.

**Correr localmente:**
```bash
cd public && python3 -m http.server 8000
# abrir http://localhost:8000
```

(`fetch('./data.json')` requiere servidor — no funciona con `file://` directo.)

### Actualizar datos

1. Abrí el Google Sheet del bot → pestaña "Registro 2026"
2. Archivo → Descargar → Valores separados por comas (.csv)
3. Corré:
   ```bash
   python3 scripts/update_data.py ruta/al/export.csv
   ```
4. Commit + push de `public/data.json`. Si está en GitHub Pages, se actualiza solo.

### Esquema de datos (`data.json`)

Cada movimiento:
```json
{
  "id": "v8-0001",
  "fecha": "DD/MM/YYYY",
  "mes": "Enero",
  "tipo": "Ingreso | Egreso",
  "cat": "Comida | Vehículo | ... | Deuda Marie | Ahorro USD | Otros",
  "concepto": "string",
  "contraparte": "string",
  "monto": 12500.0,
  "divisa": "ARS",
  "medio": "Santander - TC Visa",
  "cuotaN": "", "cuotaT": "",
  "reint": "Si | No",
  "estado": "Pendiente | Conciliado",
  "desc": ""
}
```

Todo en ARS. USD se pesifica a $1.420 al momento de cargar.

### Categorías especiales

- **Deuda Marie**: pagos a la deuda con la madre (Capa 1 del plan). Se excluye del donut de consumo.
- **Ahorro USD**: compra de dólares (dolarización/ahorro). También excluida del consumo.
- **Vehículo**: SIEMPRE al 50% en todos los meses (Marie paga la otra mitad de todos los gastos de auto).
- **Tasa de ahorro** = (Deuda Marie + Ahorro USD) / Ingresos del período.

## ContaBot (`scripts/ContaBot.gs`)

Bot de Telegram para registrar gastos/ingresos por lenguaje natural.

Arquitectura: `Telegram → Google Apps Script → Claude API (haiku-4-5) → Google Sheets`

Ver cabecera del archivo para setup completo (propiedades del script, webhook, etc).

**Propiedades requeridas** (Configuración del proyecto → Propiedades del script):
- `TELEGRAM_TOKEN`
- `ANTHROPIC_KEY`
- `SHEET_ID`
- `SHEET_NAME` (= "Registro 2026")
- `ALLOWED_CHAT_ID`

## Estado actual

- 423 movimientos cargados, Ene-Jun 2026, conciliados contra resúmenes bancarios.
- Bot funcionando, registrando en vivo desde 04/06/2026.
- Pendiente: cargar histórico en el Sheet de producción del bot (ver `Historico_2026_ContaBot.xlsx` generado en sesiones previas).
