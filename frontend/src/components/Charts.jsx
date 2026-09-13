import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

const INK = '#12211C'
const SERIES = ['#0F4D38', '#E0A526', '#C4561E', '#1A6B4E', '#5B6B64', '#8FBF6B']

const axis = { stroke: INK, fontSize: 11, tickLine: false }
const tooltipStyle = {
  contentStyle: { border: `2px solid ${INK}`, borderRadius: 0, fontSize: 12 },
  cursor: { fill: 'rgba(18,33,28,0.06)' },
}

export function PriceLine({ data, height = 220, label = 'Rate' }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="#D3DED6" strokeDasharray="3 3" />
        <XAxis dataKey="date" {...axis} tickFormatter={(d) => String(d).slice(5)} minTickGap={28} />
        <YAxis {...axis} domain={['dataMin - 8', 'dataMax + 8']} />
        <Tooltip {...tooltipStyle} formatter={(v) => [`₹${v}/kg`, label]} />
        <Line type="monotone" dataKey="price" stroke={SERIES[0]} strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function CategoryBar({ data, xKey, yKey, height = 260, unit = '' }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
        <CartesianGrid stroke="#D3DED6" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} {...axis} interval={0} angle={-18} textAnchor="end" height={54} />
        <YAxis {...axis} />
        <Tooltip {...tooltipStyle} formatter={(v) => [`${v}${unit}`, '']} />
        <Bar dataKey={yKey} fill={SERIES[0]} stroke={INK} strokeWidth={1.5}>
          {data.map((_, i) => (
            <Cell key={i} fill={SERIES[i % SERIES.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function MonthlyBars({ data, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
        <CartesianGrid stroke="#D3DED6" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" {...axis} />
        <YAxis {...axis} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="kg" name="kg collected" fill={SERIES[0]} stroke={INK} strokeWidth={1.5} />
        <Bar dataKey="count" name="transactions" fill={SERIES[1]} stroke={INK} strokeWidth={1.5} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function StatusPie({ data, height = 220 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" outerRadius={78} innerRadius={42} stroke={INK} strokeWidth={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={SERIES[i % SERIES.length]} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
