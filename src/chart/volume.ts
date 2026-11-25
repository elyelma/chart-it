import { registerIndicator, type Chart } from 'klinecharts'
import { alpha, COLORS } from './theme'

/**
 * Volume drawn inside the price pane: quiet bars along the bottom with their
 * own scale, while the candles keep the space above them.
 */

const NAME = 'CI_VOL'
const AXIS = 'ci_vol_axis'
/** Share of the pane height the tallest volume bar may use. */
const VOLUME_SHARE = 0.18
/** Price-axis padding (fraction of the candle range) with and without volume. */
const PRICE_GAP_WITH = { top: 0.1, bottom: 0.3 }
const PRICE_GAP_WITHOUT = { top: 0.1, bottom: 0.08 }

interface Vol {
  volume: number
  dir: 1 | 0 | -1
}

registerIndicator<Vol>({
  name: NAME,
  shortName: 'Vol',
  minValue: 0,
  precision: 0,
  shouldFormatBigNumber: true,
  figures: [
    {
      key: 'volume',
      title: '',
      type: 'bar',
      baseValue: 0,
      styles: ({ data }) => {
        const d = data.current?.dir ?? 0
        return { color: d > 0 ? alpha(COLORS.up, 0.3) : d < 0 ? alpha(COLORS.down, 0.3) : 'rgba(138,147,166,0.3)' }
      }
    }
  ],
  calc: list => list.map(k => ({ volume: k.volume ?? 0, dir: k.close > k.open ? 1 : k.close < k.open ? -1 : 0 })),
  // The candle legend already shows the volume: no second legend line.
  createTooltipDataSource: () => ({ name: '', calcParamsText: '', features: [], legends: [] })
})

function priceAxisId(chart: Chart): string | undefined {
  return chart.getYAxes({ paneId: 'candle_pane' }).find(a => a.id !== AXIS)?.id
}

export function showVolume(chart: Chart): void {
  chart.createYAxis({
    id: AXIS,
    paneId: 'candle_pane',
    needWidget: false,
    scrollZoomEnabled: false,
    createRange: ({ defaultRange: r }) => {
      const to = Math.max(r.realTo, 1) / VOLUME_SHARE
      return { ...r, from: 0, to, range: to, realFrom: 0, realTo: to, realRange: to, displayFrom: 0, displayTo: to, displayRange: to }
    }
  })
  chart.createIndicator({ name: NAME, paneId: 'candle_pane', yAxisId: AXIS }, true)
  const id = priceAxisId(chart)
  if (id) chart.overrideYAxis({ id, paneId: 'candle_pane', gap: PRICE_GAP_WITH })
}

export function hideVolume(chart: Chart): void {
  chart.removeIndicator({ name: NAME })
  const id = priceAxisId(chart)
  if (id) chart.overrideYAxis({ id, paneId: 'candle_pane', gap: PRICE_GAP_WITHOUT })
}
