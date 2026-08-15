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

## Vehículo al 50% (regla vigente hasta 2026-08-15)

Los registros de `Vehículo` cargados **hasta el 2026-08-15** (nafta, peajes,
seguro, patente, parking, etc.) están cargados ya con el monto al 50% —
Marie paga la otra mitad de TODO lo relacionado al auto. Esto se aplicó
directo en los datos, no es un cálculo del dashboard.

**Cambio de convención desde el 2026-08-15:** a partir de esta fecha, los
gastos de `Vehículo` se cargan por el **monto total** pagado (`reint: "Si"`
para marcar que corresponde reintegro). Cuando Marie efectivamente devuelve
su mitad, ese reintegro se carga como un movimiento de `Ingreso` aparte —
no se resta ni se anticipa en el momento de cargar el gasto. No dividir el
monto a la mitad al cargar el gasto original.

El bot (ContaBot) no aplica ninguna de estas reglas automáticamente — hay
que cargar el monto correcto a mano (total, no dividido) y, más adelante,
el ingreso del reintegro de Marie cuando corresponda.

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
