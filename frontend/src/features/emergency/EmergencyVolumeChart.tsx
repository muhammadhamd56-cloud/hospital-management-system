import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { ChartTooltip } from '@/features/reports/ChartTooltip'
import { CHART_PALETTES } from '@/features/reports/chartColors'
import { useTheme } from '@/hooks/useTheme'

export function EmergencyVolumeChart({ data }: { data: { date: string; count: number }[] }) {
  const { theme } = useTheme()
  const palette = CHART_PALETTES[theme]

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Emergency Volume</CardTitle>
        <CardDescription>Last 30 days</CardDescription>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -10 }}>
            <CartesianGrid vertical={false} stroke={palette.grid} />
            <XAxis
              dataKey="date"
              tick={{ fill: palette.axisText, fontSize: 12 }}
              axisLine={{ stroke: palette.grid }}
              tickLine={false}
              tickFormatter={(value: string) => value.slice(5)}
            />
            <YAxis tick={{ fill: palette.axisText, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: palette.grid, opacity: 0.4 }} />
            <Bar dataKey="count" name="Cases" fill={palette.series} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
