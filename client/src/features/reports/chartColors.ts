/** Chart colors, validated for CVD-safety via the dataviz skill's palette
 *  validator. Light/dark pairs are chosen per mode, not auto-derived. */
export interface ChartPalette {
  series: string
  categorical: [string, string, string]
  grid: string
  axisText: string
}

export const CHART_PALETTES: Record<'light' | 'dark', ChartPalette> = {
  light: {
    series: '#2563eb',
    categorical: ['#2a78d6', '#eb6834', '#1baf7a'],
    grid: '#e2e8f0',
    axisText: '#64748b',
  },
  dark: {
    series: '#60a5fa',
    categorical: ['#3987e5', '#d95926', '#199e70'],
    grid: '#334155',
    axisText: '#94a3b8',
  },
}
