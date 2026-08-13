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
    series: '#0d9488',
    categorical: ['#0d9488', '#eb6834', '#7c3aed'],
    grid: '#e2e8f0',
    axisText: '#64748b',
  },
  dark: {
    series: '#2dd4bf',
    categorical: ['#2dd4bf', '#d95926', '#a78bfa'],
    grid: '#334155',
    axisText: '#94a3b8',
  },
}
