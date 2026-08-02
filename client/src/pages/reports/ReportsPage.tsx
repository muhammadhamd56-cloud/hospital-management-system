import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts'
import { useTheme } from '@/hooks/useTheme'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { ChartTooltip } from '@/features/reports/ChartTooltip'
import { CHART_PALETTES } from '@/features/reports/chartColors'
import {
  appointmentsByDepartment,
  patientStatusDistribution,
  MONTHLY_REVENUE,
} from '@/features/reports/aggregations'
import { formatCurrency } from '@/utils/currency'

const departmentData = appointmentsByDepartment()
const statusData = patientStatusDistribution()

export function ReportsPage() {
  const { theme } = useTheme()
  const palette = CHART_PALETTES[theme]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Reports</h1>
        <p className="text-sm text-ink-muted">
          Operational analytics across appointments, revenue, and patients.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Appointments by Department</CardTitle>
            <CardDescription>Total scheduled appointments per department.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={departmentData} margin={{ left: -20 }}>
                <CartesianGrid vertical={false} stroke={palette.grid} />
                <XAxis
                  dataKey="department"
                  tick={{ fill: palette.axisText, fontSize: 12 }}
                  axisLine={{ stroke: palette.grid }}
                  tickLine={false}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={56}
                />
                <YAxis
                  tick={{ fill: palette.axisText, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: palette.grid, opacity: 0.4 }} />
                <Bar
                  dataKey="count"
                  name="Appointments"
                  fill={palette.series}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
            <CardDescription>Monthly billed revenue, last 6 months.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={MONTHLY_REVENUE} margin={{ left: -10 }}>
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
                <Tooltip content={<ChartTooltip valueFormatter={formatCurrency} />} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke={palette.series}
                  strokeWidth={2}
                  dot={{ r: 4, fill: palette.series }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Patient Status Distribution</CardTitle>
            <CardDescription>Current mix of active, admitted, and discharged patients.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="count"
                  nameKey="status"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
                >
                  {statusData.map((entry, index) => (
                    <Cell
                      key={entry.status}
                      fill={palette.categorical[index % palette.categorical.length]}
                      stroke="var(--color-surface)"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ color: palette.axisText, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
