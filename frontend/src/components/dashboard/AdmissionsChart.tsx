import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { ChartTooltip } from '@/features/reports/ChartTooltip'
import { CHART_PALETTES } from '@/features/reports/chartColors'
import { WEEKLY_ADMISSIONS } from '@/features/dashboard/mockDashboardData'
import { useTheme } from '@/hooks/useTheme'

export function AdmissionsChart() {
  const { theme } = useTheme()
  const palette = CHART_PALETTES[theme]

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Patient Admissions</CardTitle>
        <CardDescription>Last 7 days</CardDescription>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={WEEKLY_ADMISSIONS} margin={{ left: -10 }}>
            <CartesianGrid vertical={false} stroke={palette.grid} />
            <XAxis
              dataKey="day"
              tick={{ fill: palette.axisText, fontSize: 12 }}
              axisLine={{ stroke: palette.grid }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: palette.axisText, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip />} />
            <Line
              type="monotone"
              dataKey="admissions"
              name="Admissions"
              stroke={palette.series}
              strokeWidth={2}
              dot={{ r: 4, fill: palette.series }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
