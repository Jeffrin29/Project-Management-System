'use client';

import { useState, useEffect, useCallback } from 'react';
import { attendanceApi, leaveApi } from "../../../lib/api";
import { formatISTDate, formatISTTime } from "../../../lib/date";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Attendance {
    _id: string;
    date: string;
    checkIn: string;
    checkOut: string;
    status: string;
    workingHours?: number;
    late?: boolean;
}

interface Leave {
    _id: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: 'pending' | 'approved' | 'rejected' | string;
}

// ── Badge Component ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
    const s = status?.toLowerCase();
    const m: Record<string, string> = {
        pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
        rejected: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
        present: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
        late: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        absent: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
        holiday: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
        'half day': 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
    };
    return (
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${m[s] || 'bg-gray-100 text-gray-500'}`}>
            {status}
        </span>
    );
}

// ── Bar Chart Component (Simplified) ──────────────────────────────────────────
function SimplePieChart({ data }: { data: any[] }) {
    if (!Array.isArray(data) || data.length === 0) return <div className="h-40 flex items-center justify-center text-gray-400 italic">No attendance data</div>;

    const summary = { present: 0, absent: 0, leave: 0, holiday: 0 };
    data.forEach(d => {
        const s = d.status?.toLowerCase();
        if (s === 'present' || s === 'late' || s === 'half day') summary.present++;
        else if (s === 'absent') summary.absent++;
        else if (s === 'leave') summary.leave++;
        else if (s === 'holiday') summary.holiday++;
    });

    const total = summary.present + summary.absent + summary.leave + summary.holiday;
    if (total === 0) return <div className="h-40 flex items-center justify-center text-gray-400">No records found.</div>;

    const p1 = (summary.present / total) * 100;
    const p2 = p1 + (summary.absent / total) * 100;
    const p3 = p2 + (summary.leave / total) * 100;

    return (
        <div className="flex flex-col items-center">
            <div className="relative w-36 h-36 rounded-full shadow-inner border-4 border-white dark:border-zinc-800"
                style={{
                    background: `conic-gradient(
                        #22c55e 0% ${p1}%,
                        #ef4444 ${p1}% ${p2}%,
                        #facc15 ${p2}% ${p3}%,
                        #3b82f6 ${p3}% 100%
                    )`
                }}
            />
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-6 text-[10px] font-bold uppercase tracking-tight">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#22c55e]" /> Present ({summary.present})</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#ef4444]" /> Absent ({summary.absent})</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#facc15]" /> Leave ({summary.leave})</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#3b82f6]" /> Holiday ({summary.holiday})</div>
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
/**
 * Note on Timezones:
 * MongoDB stores all timestamps in UTC. This is correct practice.
 * We convert UTC -> IST only for display using formatIST helpers.
 */
export default function EmployeePage() {
    const [activeTab, setActiveTab] = useState<'attendance' | 'apply' | 'history'>('attendance');
    const [stats, setStats] = useState<any>(null);
    const [attendance, setAttendance] = useState<Attendance[]>([]);
    const [leaves, setLeaves] = useState<Leave[]>([]);
    const [chartData, setChartData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [s, a, l, c] = await Promise.all([
                attendanceApi.getStats(),
                attendanceApi.getHistory(),
                leaveApi.getHistory(),
                attendanceApi.getMonthlyChart()
            ]);

            console.log('[EmployeePage] Stats raw:', s);
            console.log('[EmployeePage] Attendance raw:', a);
            console.log('[EmployeePage] Leaves raw:', l);
            console.log('[EmployeePage] Chart raw:', c);

            // Standard envelope: { success: true, data: { ... } } or { success: true, data: [...] }
            // Stats is an object
            const statsData = s?.data?.data ?? s?.data ?? null;
            setStats(statsData);

            // Attendance and leaves are arrays
            const attData = a?.data?.data ?? a?.data ?? [];
            setAttendance(Array.isArray(attData) ? attData : []);

            const leavesData = l?.data?.data ?? l?.data ?? [];
            setLeaves(Array.isArray(leavesData) ? leavesData : []);

            const chartRaw = c?.data?.data ?? c?.data ?? [];
            setChartData(Array.isArray(chartRaw) ? chartRaw : []);

            console.log('[EmployeePage] Parsed stats:', statsData);
            console.log('[EmployeePage] Parsed attendance count:', Array.isArray(attData) ? attData.length : 0);
            console.log('[EmployeePage] Parsed leaves count:', Array.isArray(leavesData) ? leavesData.length : 0);
        } catch (err) {
            console.error('[EmployeePage] Failed to fetch data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        window.addEventListener("attendanceUpdated", fetchData);
        return () => window.removeEventListener("attendanceUpdated", fetchData);
    }, [fetchData]);

    console.log("Attendance:", attendance);
    console.log("Leaves:", leaves);

    const handleDeleteLeave = async (id: string) => {
        if (!confirm("Are you sure you want to cancel this leave request?")) return;
        try {
            await leaveApi.delete(id);
            fetchData();
        } catch (err: any) {
            alert(err?.response?.data?.message || err?.message || "Failed to cancel leave");
        }
    };

    const handleApplyLeave = async (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const data = Object.fromEntries(formData);
        const payload = { leaveType: data.leaveType, startDate: data.startDate, endDate: data.endDate, reason: data.reason };
        setActionLoading(true);
        try {
            await leaveApi.apply(payload);
            alert('Leave applied successfully');
            fetchData();
            setActiveTab('history');
        } catch (err: any) {
            alert(err?.response?.data?.message || err?.message || "Something went wrong");
        }
        finally { setActionLoading(false); }
    };

    return (
        <div className="space-y-8 pb-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Employee Dashboard</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Self-service portal for attendance and leaves</p>
                </div>
            </div>

            <div className="grid grid-cols-5 gap-6">
                <div className="col-span-3 grid grid-cols-2 gap-4">
                    {[
                        { label: 'Leaves (Month)', value: stats?.monthlyLeaves ?? '0', color: 'text-violet-600' },
                        { label: 'Pending Requests', value: stats?.pendingRequests ?? '0', color: 'text-amber-600' },
                        { label: 'Attendance %', value: `${stats?.attendancePercentage ?? '0'}%`, color: 'text-blue-600' },
                        { label: 'Present Days', value: stats?.presentDays ?? '0', color: 'text-emerald-600' },
                    ].map((s) => (
                        <div key={s.label} className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">{s.label}</p>
                            <p className={`text-4xl font-black mt-2 ${s.color}`}>{s.value}</p>
                        </div>
                    ))}
                </div>

                <div className="col-span-2 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-gray-900 dark:text-white">Attendance Analytics</h3>
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">Month</span>
                    </div>
                    <SimplePieChart data={chartData} />
                </div>
            </div>

            <div className="flex gap-2 border-b border-gray-100 dark:border-zinc-800">
                {(['attendance', 'apply', 'history'] as const).map((t) => (
                    <button key={t} onClick={() => setActiveTab(t)} className={`px-5 py-3 text-sm font-medium border-b-2 transition -mb-px ${activeTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        {t === 'attendance' ? 'My Attendance' : t === 'apply' ? 'Apply Leave' : 'Leave History'}
                    </button>
                ))}
            </div>

            <div className="space-y-4">
                {activeTab === 'attendance' && (
                    <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 dark:bg-zinc-800/50">
                                <tr>
                                    <th className="px-5 py-4 font-semibold">Date</th>
                                    <th className="px-5 py-4 font-semibold">Check In</th>
                                    <th className="px-5 py-4 font-semibold">Check Out</th>
                                    <th className="px-5 py-4 font-semibold">Hours</th>
                                    <th className="px-5 py-4 font-semibold">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-zinc-800">
                                {loading ? (
                                    <tr><td colSpan={5} className="text-center py-10">Loading...</td></tr>
                                ) : Array.isArray(attendance) && attendance.length > 0 ? (
                                    attendance.map((a) => (
                                        <tr key={a._id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/40">
                                            <td className="px-5 py-4 font-medium">{formatISTDate(a.date)}</td>
                                            <td className="px-5 py-4">{formatISTTime(a.checkIn)}</td>
                                            <td className="px-5 py-4">{formatISTTime(a.checkOut)}</td>
                                            <td className="px-5 py-4 font-medium">{a.workingHours !== undefined ? `${a.workingHours.toFixed(1)}h` : '—'}</td>
                                            <td className="px-5 py-4"><StatusBadge status={a.status} /></td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan={5} className="text-center py-10 text-gray-400">No attendance records found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'apply' && (
                    <div className="max-w-2xl mx-auto bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl p-8 shadow-sm">
                        <h3 className="text-xl font-bold mb-6">Request Time Off</h3>
                        <form onSubmit={handleApplyLeave} className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1.5">Leave Type</label>
                                    <select name="leaveType" required className="w-full p-2.5 rounded-xl border dark:bg-zinc-800 bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                                        <option>Sick Leave</option>
                                        <option>Casual Leave</option>
                                        <option>Annual Leave</option>
                                        <option>Unpaid Leave</option>
                                    </select>
                                </div>
                                <div />
                                <div>
                                    <label className="block text-sm font-medium mb-1.5">Start Date</label>
                                    <input name="startDate" type="date" required className="w-full p-2.5 rounded-xl border dark:bg-zinc-800 bg-white outline-none" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1.5">End Date</label>
                                    <input name="endDate" type="date" required className="w-full p-2.5 rounded-xl border dark:bg-zinc-800 bg-white outline-none" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1.5">Reason</label>
                                <textarea name="reason" rows={3} placeholder="Please provide details..." className="w-full p-2.5 rounded-xl border dark:bg-zinc-800 bg-white focus:ring-2 focus:ring-blue-500 outline-none" />
                            </div>
                            <button disabled={actionLoading} type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition disabled:opacity-50">
                                {actionLoading ? 'Submitting...' : 'Submit Application'}
                            </button>
                        </form>
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 dark:bg-zinc-800/50">
                                <tr>
                                    <th className="px-5 py-4 font-semibold">Type</th>
                                    <th className="px-5 py-4 font-semibold">Start</th>
                                    <th className="px-5 py-4 font-semibold">End</th>
                                    <th className="px-5 py-4 font-semibold">Reason</th>
                                    <th className="px-5 py-4 font-semibold">Status</th>
                                    <th className="px-5 py-4 font-semibold text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-zinc-800">
                                {loading ? (
                                    <tr><td colSpan={6} className="text-center py-10">Loading...</td></tr>
                                ) : Array.isArray(leaves) && leaves.length > 0 ? (
                                    leaves.map((l) => (
                                        <tr key={l._id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/40">
                                            <td className="px-5 py-4 font-medium">{l.leaveType}</td>
                                            <td className="px-5 py-4">{formatISTDate(l.startDate)}</td>
                                            <td className="px-5 py-4">{formatISTDate(l.endDate)}</td>
                                            <td className="px-5 py-4 text-xs text-gray-500 truncate max-w-[150px]">{l.reason}</td>
                                            <td className="px-5 py-4"><StatusBadge status={l.status} /></td>
                                            <td className="px-5 py-4 text-right">
                                                <button
                                                    onClick={() => handleDeleteLeave(l._id)}
                                                    className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-lg transition-colors"
                                                    title="Cancel Request"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan={6} className="text-center py-10 text-gray-400">No leave requests found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
