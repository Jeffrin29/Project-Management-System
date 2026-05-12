"use client";

import { useEffect, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import {
  FaFolderOpen,
  FaRocket,
  FaCircleCheck,
  FaTriangleExclamation,
  FaUsers,
  FaClock,
  FaBriefcase,
  FaWallet,
  FaShieldHalved,
  FaChartLine,
  FaArrowRotateRight,
} from "react-icons/fa6";
import { request } from "../../lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Summary {
  totalProjects: number;
  activeProjects: number;
  completedTasks: number;
  overdueTasks: number;
  teamUtilization: number;
}

interface ActivityItem {
  _id: string;
  action: string;
  metadata: Record<string, any>;
  createdAt: string;
  userId?: { name: string };
}

// ── Helper ────────────────────────────────────────────────────────────────────
/**
 * Note on Timezones:
 * MongoDB stores all timestamps in UTC. This is correct practice.
 * We convert UTC -> IST only for display or for time-relative calculations.
 */
function timeAgo(date: string) {
  if (!date) return "just now";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "just now";
  // Date.now() is UTC epoch, d.getTime() is UTC epoch. Diff is timezone-safe.
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Badge Component ───────────────────────────────────────────────────────────
function Badge({
  children,
  variant = "info",
}: {
  children: React.ReactNode;
  variant?: "success" | "warning" | "danger" | "info";
}) {
  const styles = {
    success:
      "bg-emerald-50 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-400/20",
    warning:
      "bg-amber-50 dark:bg-amber-400/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-400/20",
    danger:
      "bg-rose-50 dark:bg-rose-400/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-400/20",
    info: "bg-sky-50 dark:bg-cyan-400/10 text-sky-700 dark:text-cyan-400 border-sky-200 dark:border-cyan-400/20",
  };
  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${styles[variant]} whitespace-nowrap uppercase tracking-wide`}
    >
      {children}
    </span>
  );
}

const cardColors: Record<string, string> = {
  total: "bg-gradient-to-r from-blue-500 to-blue-700",
  active: "bg-gradient-to-r from-emerald-500 to-teal-600",
  completed: "bg-gradient-to-r from-violet-500 to-purple-600",
  overdue: "bg-gradient-to-r from-rose-500 to-red-600",
  utilization: "bg-gradient-to-r from-orange-500 to-amber-600",
};

function KPICard({
  label,
  value,
  icon: Icon,
  type,
}: {
  label: string;
  value: string | number;
  icon: any;
  type: keyof typeof cardColors;
}) {
  return (
    <div className={`kpi-card rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-all duration-300 group text-white ${cardColors[type]}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <p className="text-[11px] font-semibold text-white/80 uppercase tracking-widest">
            {label}
          </p>
          <div className="text-3xl font-bold text-white">
            {value}
          </div>
        </div>
        <div
          className={`p-3.5 rounded-xl bg-white/20 text-white flex-shrink-0`}
        >
          <Icon className="text-xl" />
        </div>
      </div>
    </div>
  );
}

// ── Health Row ────────────────────────────────────────────────────────────────
function HealthRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: any;
}) {
  const lowValue = value.toLowerCase();
  const isGood =
    lowValue.includes("ahead") ||
    lowValue.includes("under") ||
    (lowValue.includes("0 overdue") && !lowValue.includes("overdue")) ||
    lowValue.includes("healthy") ||
    lowValue.includes("on budget") ||
    lowValue.includes("on schedule");
  const isWarn =
    lowValue.includes("behind") || lowValue.includes("over budget");
  const isDanger =
    lowValue.includes("overdue") ||
    lowValue.includes("at risk") ||
    lowValue.includes("risk");

  const variant = isGood
    ? "success"
    : isWarn
    ? "warning"
    : isDanger
    ? "danger"
    : "info";

  return (
    <div className="flex items-center justify-between py-3.5 border-b border-gray-100 dark:border-zinc-800/40 last:border-0 hover:bg-gray-50 dark:hover:bg-zinc-800/20 px-2 rounded-lg transition-all">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
          <Icon className="text-sm text-gray-500 dark:text-zinc-500" />
        </div>
        <span className="text-[13px] font-semibold text-gray-700 dark:text-zinc-100">
          {label}
        </span>
      </div>
      <Badge variant={variant}>{value}</Badge>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { resolvedTheme } = useTheme();

  const fetchUnified = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request("/dashboard");
      setData(res?.data || res || null);
    } catch (err) {
      console.error("[Dashboard] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnified();
  }, [fetchUnified]);

  const summary: Summary = data?.summary || {
    totalProjects: data?.totalProjects || 0,
    activeProjects: data?.activeProjects || 0,
    completedTasks: data?.completedTasks || 0,
    overdueTasks: data?.overdueTasks || 0,
    teamUtilization: data?.teamUtilization || 0,
  };
  const taskAnalytics = data?.taskAnalytics || [];
  const projectProgress = data?.projectProgress || [];
  const activity: ActivityItem[] = data?.recentActivity || [];

  const isDark = resolvedTheme === "dark";

  const tooltipStyle = {
    background: isDark ? "#18181b" : "#ffffff",
    border: isDark ? "none" : "1px solid #e5e7eb",
    borderRadius: "12px",
    color: isDark ? "#fff" : "#111827",
    fontSize: "12px",
    boxShadow: isDark ? "none" : "0 4px 20px rgba(0,0,0,0.08)",
  };

  return (
    <div className="space-y-6 sm:space-y-8 pb-12">

      {/* SECTION 1: Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 dark:border-zinc-800/50 pb-6 sm:pb-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Project Intelligence
          </h1>
          <p className="text-gray-500 dark:text-zinc-500 font-medium text-sm mt-1">
            Real-time overview of your workspace diagnostic telemetry
          </p>
        </div>
        <button
          onClick={fetchUnified}
          disabled={loading}
          className="self-start sm:self-auto bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold uppercase tracking-wider px-5 py-3 rounded-xl transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2 disabled:opacity-50 min-h-[44px]"
        >
          <FaArrowRotateRight className={loading ? "animate-spin" : ""} />
          Refresh Data
        </button>
      </div>

      {/* SECTION 2: KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          label="Total Projects"
          value={loading ? "..." : summary.totalProjects}
          icon={FaFolderOpen}
          type="total"
        />
        <KPICard
          label="Active Projects"
          value={loading ? "..." : summary.activeProjects}
          icon={FaRocket}
          type="active"
        />
        <KPICard
          label="Tasks Completed"
          value={loading ? "..." : summary.completedTasks}
          icon={FaCircleCheck}
          type="completed"
        />
        <KPICard
          label="Overdue Items"
          value={loading ? "..." : summary.overdueTasks}
          icon={FaTriangleExclamation}
          type="overdue"
        />
        <KPICard
          label="Utilization"
          value={loading ? "..." : `${summary.teamUtilization}%`}
          icon={FaUsers}
          type="utilization"
        />
      </div>

      {/* SECTION 3: Operations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">

        {/* Health Panel */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-800 dark:text-white uppercase text-[11px] tracking-widest">
              Health Indicators
            </h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-gray-400 dark:text-zinc-500 font-medium uppercase tracking-wider hidden sm:block">Live</span>
            </div>
          </div>
          {loading ? (
            <div className="flex-1 flex justify-center items-center py-12">
              <div className="w-8 h-8 border-4 border-gray-200 dark:border-zinc-800 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : !data?.health ? (
            <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-16 italic">
              No telemetry data...
            </p>
          ) : (
            <div className="space-y-0.5">
              <HealthRow label="Timeline" value={data.health.time} icon={FaClock} />
              <HealthRow label="Workload" value={data.health.workload} icon={FaBriefcase} />
              <HealthRow label="Budget" value={data.health.cost} icon={FaWallet} />
              <HealthRow label="Risk" value={summary.overdueTasks > 0 ? "Elevated" : "Normal"} icon={FaShieldHalved} />
              <HealthRow label="Progress" value={data.health.progress} icon={FaChartLine} />
            </div>
          )}
        </div>

        {/* Task Distribution Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-800 dark:text-white uppercase text-[11px] tracking-widest">
              Task Distribution
            </h3>
            <span className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-widest bg-gray-100 dark:bg-zinc-800 px-2.5 py-1 rounded-full">
              By Status
            </span>
          </div>
          {loading ? (
            <div className="h-64 flex justify-center items-center">
              <div className="w-8 h-8 border-4 border-gray-200 dark:border-zinc-800 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12 flex-1">
              <div className="flex-shrink-0 relative w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={taskAnalytics}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {taskAnalytics.map((entry: any, i: number) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-gray-400 dark:text-zinc-500 text-[10px] font-bold uppercase tracking-widest leading-none mb-1">
                    Total
                  </div>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">
                    {taskAnalytics.reduce((a: number, b: any) => a + b.value, 0)}
                  </div>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-3 w-full">
                {taskAnalytics?.map((item: any) => (
                  <div
                    key={item.name}
                    className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 dark:bg-zinc-800/40 border border-gray-200 dark:border-zinc-800/50 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors"
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ background: item.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-gray-500 dark:text-zinc-500 uppercase tracking-widest mb-0.5 truncate">
                        {item.name}
                      </p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {item.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Mission Progress */}
        <div className="lg:col-span-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-gray-800 dark:text-white uppercase text-[11px] tracking-widest">
              Mission Progress
            </h3>
            <span className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-widest bg-gray-100 dark:bg-zinc-800 px-2.5 py-1 rounded-full">
              Active Top 8
            </span>
          </div>
          {loading ? (
            <div className="py-16 flex justify-center">
              <div className="w-10 h-10 border-4 border-gray-200 dark:border-zinc-800 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : !projectProgress || projectProgress.length === 0 ? (
            <div className="py-16 text-center text-gray-400 dark:text-zinc-500 text-sm font-medium">
              No active mission telemetry detected
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {projectProgress.slice(0, 8).map((p: any, idx: number) => {
                const name =
                  p.projectName ||
                  p.name ||
                  p.projectTitle ||
                  p.title ||
                  `Mission ${idx + 1}`;
                const uniqueKey = p.id || p._id || `${name}-${idx}`;

                return (
                  <div key={uniqueKey} className="group flex flex-col space-y-3">
                    <div className="flex justify-between items-end">
                      <span className="text-[13px] font-semibold text-gray-800 dark:text-white truncate max-w-[70%] group-hover:text-blue-600 dark:group-hover:text-blue-500 transition-colors">
                        {name}
                      </span>
                      <span className="text-[11px] font-bold text-blue-600 dark:text-blue-500">
                        {p.completion || p.progress || 0}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${p.completion || p.progress || 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="lg:col-span-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-800 dark:text-white uppercase text-[11px] tracking-widest">
              System Activity
            </h3>
            <span className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-widest bg-gray-100 dark:bg-zinc-800 px-2.5 py-1 rounded-full">
              Recent Events
            </span>
          </div>
          {loading ? (
            <div className="py-16 flex justify-center">
              <div className="w-10 h-10 border-4 border-gray-200 dark:border-zinc-800 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activity?.slice(0, 9).map((a: any, idx: number) => (
                <div
                  key={a._id || idx}
                  className="flex gap-3 p-4 bg-gray-50 dark:bg-zinc-800/20 rounded-2xl border border-gray-100 dark:border-transparent hover:border-gray-300 dark:hover:border-zinc-800 hover:shadow-sm transition-all duration-300"
                >
                  <div className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-zinc-800 flex items-center justify-center text-gray-700 dark:text-white text-xs font-bold flex-shrink-0">
                    {a.userId?.name?.charAt(0) ?? "S"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-gray-800 dark:text-zinc-100 truncate mb-0.5">
                      {a.action?.replace(":", " ") || "Terminal Event"}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-medium">
                      {timeAgo(a.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}