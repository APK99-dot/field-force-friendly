import { Card, CardContent } from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
  LineChart,
  Line,
  AreaChart,
  Area,
  Label,
} from "recharts";

export const CHART_PALETTE = [
  "hsl(217 80% 58%)",
  "hsl(160 64% 42%)",
  "hsl(35 90% 55%)",
  "hsl(0 75% 60%)",
  "hsl(262 70% 60%)",
  "hsl(190 70% 45%)",
  "hsl(330 75% 58%)",
  "hsl(220 10% 65%)",
];

export interface ChartDatum {
  name: string;
  [key: string]: string | number;
}

export interface ChartSeries {
  key: string;
  label: string;
  color?: string;
}

type ChartType =
  | "bar"
  | "pie"
  | "donut"
  | "hbar"
  | "groupedBar"
  | "stackedBar"
  | "line"
  | "area";

interface Props {
  title: string;
  description?: string;
  type: ChartType;
  data: ChartDatum[];
  series?: ChartSeries[];
  valueKey?: string;
  formatValue?: (v: number) => string;
  height?: number;
  centerLabel?: { value: string; label: string };
}

export function ReportChartCard({
  title,
  description,
  type,
  data,
  series,
  valueKey = "value",
  formatValue = (v) => v.toLocaleString("en-IN"),
  height = 300,
  centerLabel,
}: Props) {
  const hasData = data.length > 0;

  const renderChart = () => {
    if (type === "pie" || type === "donut") {
      const isDonut = type === "donut";
      return (
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={isDonut ? Math.min(70, height / 4.4) : 0}
            outerRadius={Math.min(110, height / 2.6)}
            paddingAngle={isDonut ? 2 : 0}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
            {isDonut && centerLabel && (
              <Label
                position="center"
                content={({ viewBox }) => {
                  const { cx, cy } = viewBox as { cx: number; cy: number };
                  return (
                    <g>
                      <text x={cx} y={cy - 6} textAnchor="middle" className="fill-foreground" style={{ fontSize: 22, fontWeight: 700 }}>
                        {centerLabel.value}
                      </text>
                      <text x={cx} y={cy + 14} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 11 }}>
                        {centerLabel.label}
                      </text>
                    </g>
                  );
                }}
              />
            )}
          </Pie>
          <Tooltip formatter={(v: number) => formatValue(v)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      );
    }

    if (type === "hbar") {
      return (
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatValue(v)} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
          <Tooltip formatter={(v: number) => formatValue(v)} />
          <Bar dataKey={valueKey} radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      );
    }

    if ((type === "groupedBar" || type === "stackedBar") && series) {
      const stacked = type === "stackedBar";
      return (
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => formatValue(v)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId={stacked ? "a" : undefined}
              radius={stacked ? 0 : [4, 4, 0, 0]}
              fill={s.color || CHART_PALETTE[i % CHART_PALETTE.length]}
            />
          ))}
        </BarChart>
      );
    }

    if (type === "line" && series) {
      return (
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => formatValue(v)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color || CHART_PALETTE[i % CHART_PALETTE.length]}
              strokeWidth={2}
              dot={{ r: 2.5 }}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      );
    }

    if (type === "area" && series) {
      return (
        <AreaChart data={data}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color || CHART_PALETTE[i % CHART_PALETTE.length]} stopOpacity={0.5} />
                <stop offset="95%" stopColor={s.color || CHART_PALETTE[i % CHART_PALETTE.length]} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => formatValue(v)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color || CHART_PALETTE[i % CHART_PALETTE.length]}
              fill={`url(#grad-${s.key})`}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      );
    }

    // default: single bar
    return (
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) => formatValue(v)} />
        <Bar dataKey={valueKey} radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    );
  };

  return (
    <Card className="shadow-card">
      <CardContent className="p-4 sm:p-6">
        <h3 className="text-base font-bold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        <div className="mt-4" style={{ height }}>
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              {renderChart()}
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No data to chart for the selected filters.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
