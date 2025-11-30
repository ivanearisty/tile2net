import React from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import '../styles/MetricsDashboard.css';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip">
        <p className="tooltip-label">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {entry.value.toLocaleString()}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const MetricsDashboard = ({ data, selectedYear }) => {
  const currentYearData = data.find(d => d.year === selectedYear) || data[data.length - 1];
  
  return (
    <div className="metrics-dashboard">
      <h3 className="dashboard-title">Infrastructure Metrics</h3>
      
      {/* Net Change Chart */}
      <div className="chart-container">
        <h4 className="chart-title">Annual Net Change (meters)</h4>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="year" 
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              tickLine={{ stroke: '#4b5563' }}
            />
            <YAxis 
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              tickLine={{ stroke: '#4b5563' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine x={selectedYear} stroke="#f59e0b" strokeWidth={2} />
            <Bar 
              dataKey="net" 
              fill="#10b981"
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Cumulative Growth Chart */}
      <div className="chart-container">
        <h4 className="chart-title">Cumulative Infrastructure (meters)</h4>
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="year" 
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              tickLine={{ stroke: '#4b5563' }}
            />
            <YAxis 
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              tickLine={{ stroke: '#4b5563' }}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine x={selectedYear} stroke="#f59e0b" strokeWidth={2} />
            <Area 
              type="monotone"
              dataKey="totalLength" 
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#totalGradient)"
              name="Total Length"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Added vs Removed Chart */}
      <div className="chart-container">
        <h4 className="chart-title">Added vs Removed</h4>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="year" 
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              tickLine={{ stroke: '#4b5563' }}
            />
            <YAxis 
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              tickLine={{ stroke: '#4b5563' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine x={selectedYear} stroke="#f59e0b" strokeWidth={2} />
            <Line 
              type="monotone"
              dataKey="added" 
              stroke="#10b981"
              strokeWidth={2}
              dot={{ fill: '#10b981', r: 3 }}
              name="Added"
            />
            <Line 
              type="monotone"
              dataKey="removed" 
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ fill: '#ef4444', r: 3 }}
              name="Removed"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Current Year Stats */}
      <div className="current-stats">
        <div className="stat-row">
          <span className="stat-label">Selected Year Total:</span>
          <span className="stat-value">{currentYearData.totalLength.toLocaleString()}m</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Segments:</span>
          <span className="stat-value">{currentYearData.segments}</span>
        </div>
      </div>
    </div>
  );
};

export default MetricsDashboard;

