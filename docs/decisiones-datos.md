# Decisiones de datos — La Caja

Notas para quien (humano o Claude Code) edite `app.js` o `update_data.py` sin
contexto de las sesiones donde se armó el dataset.

## Categorías que NO son consumo

`Deuda Marie` y `Ahorro USD` se excluyen de:
- Donut "Egresos por categoría · consumo"
- KPI "Gastos de consumo"

Se usan para:
- KPI "Deuda Marie pagada" / "Compra de dólares"
- Tasa de ahorro = (Deuda Marie + Ahorro USD) / Ingresos

Si se agregan categorías nuevas de este tipo, actualizar `NO_CONSUMO` en `app.js`.

## Vehículo al 50%

Toda la categoría `Vehículo` (nafta, peajes, seguro, patente, parking, etc.)
está cargada ya con el monto al 50% — Marie paga la otra mitad de TODO lo
relacionado al auto. Esto se aplicó en los datos, no es un cálculo del
dashboard. Si se carga un gasto de Vehículo nuevo a mano, cargar ya la mitad.

El bot (ContaBot) NO aplica esta regla automáticamente — el usuario debe
cargar el monto ya divivido, o se ajusta manualmente después en el Sheet.

## Ingresos excluidos del KPI "Ingresos"

`Reintegro` y `Préstamo recibido` se excluyen del KPI "Ingresos" (no son
ingreso real, son entradas de plata que ya salió o que hay que devolver).
Ver `NO_ING` en `app.js`.

## USD → ARS

Todo el dataset está en ARS. Conversión usada: **$1.420 por USD** (tipo de
cambio de referencia al momento de la carga, Ene-Jun 2026). Si se carga un
movimiento nuevo en USD, pesificar a ese valor para mantener consistencia
histórica, o documentar el tipo de cambio usado si cambia.

## Pagos a Deuda Marie confirmados (histórico)

| Mes | USD | ARS @1420 |
|---|---|---|
| Enero (19/01) | 1.000 | 1.420.000 |
| Febrero (17/02) | 125 | 177.500 |
| Marzo (05/03) | 200 | 284.000 |

Saldo deuda a fin de marzo: ~USD 1.000 (según Proyecto_Independizarme.txt,
capacidad de pago USD 200/mes).

## Categoría "Otros" pendiente

A la fecha de armado del dataset (423 movs), quedan ~65 egresos en "Otros"
que son transferencias a personas sin categoría clara (Sittner Luis, Luciano
Zolezzi, Matías Bedetti, etc.). Pendiente de categorización manual.
