import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { ChartTooltip } from '@/features/reports/ChartTooltip'
import { CHART_PALETTES } from '@/features/reports/chartColors'
import { MONTHLY_REVENUE } from '@/features/reports/aggregations'
import { formatCurrency } from '@/utils/currency'
import { useTheme } from '@/hooks/useTheme'

export function RevenueChart() {
  const { theme } = useTheme()
  const palette = CHART_PALETTES[theme]

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Monthly Revenue</CardTitle>
        <CardDescription>Last 6 months</CardDescription>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={MONTHLY_REVENUE} margin={{ left: -10 }}>
            <CartesianGrid vertical={false} stroke={palette.grid} />
            <XAxis
              dataKey="month"
              tick={{ fill: palette.axisText, fontSize: 12 }}
              axisLine={{ stroke: palette.grid }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: palette.axisText, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => `$${Math.round(value / 1000)}k`}
            />
            <Tooltip
              content={<ChartTooltip valueFormatter={formatCurrency} />}
              cursor={{ fill: palette.grid, opacity: 0.4 }}
            />
            <Bar
              dataKey="revenue"
              name="Revenue"
              fill={palette.series}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
