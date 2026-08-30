import { useEffect, useState } from 'react'
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
import { listPatients } from '@/features/patients/api'
import { useTheme } from '@/hooks/useTheme'

interface DailyRegistrations {
  day: string
  registrations: number
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** One point per of the last 7 calendar days (oldest first, today last),
 *  counting patients whose account was created that day. */
function toWeeklyRegistrations(joinedDates: string[]): DailyRegistrations[] {
  const days: DailyRegistrations[] = []
  const today = new Date()

  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(today)
    date.setDate(date.getDate() - offset)
    const dateKey = date.toISOString().slice(0, 10)

    const count = joinedDates.filter((joinedAt) => joinedAt.slice(0, 10) === dateKey).length
    days.push({ day: DAY_LABELS[date.getDay()], registrations: count })
  }

  return days
}

export function AdmissionsChart() {
  const { theme } = useTheme()
  const palette = CHART_PALETTES[theme]
  const [data, setData] = useState<DailyRegistrations[]>(toWeeklyRegistrations([]))

  useEffect(() => {
    listPatients()
      .then((res) => setData(toWeeklyRegistrations(res.patients.map((patient) => patient.joinedAt))))
      .catch(() => setData(toWeeklyRegistrations([])))
  }, [])

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>New Patient Registrations</CardTitle>
        <CardDescription>Last 7 days</CardDescription>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -10 }}>
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
              dataKey="registrations"
              name="Registrations"
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
