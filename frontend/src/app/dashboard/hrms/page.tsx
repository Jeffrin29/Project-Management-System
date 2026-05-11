'use client';

import { useState, useEffect, useCallback } from 'react';
import { hrmsApi } from "../../../lib/api";
import { useRouter } from "next/navigation";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────
interface HrmsStats {
    totalEmployees: number;
    activeEmployees: number;
    departmentsCount: number;
    pendingLeaves: number;
}

interface Employee {
    _id: string;
    name: string;
    email: string;
    role: string;
    department: string;
    status: 'active' | 'inactive';
    userId?: string;
}

interface Department {
    _id: string;
    name: string;
    description: string;
}

interface Attendance {
    _id: string;
    employeeId: { name: string; email: string; department: string };
    date: string;
    checkIn: string;
    checkOut: string;
    status: 'present' | 'absent' | 'half-day' | 'late';
}

interface Leave {
    _id: string;
    employeeId: { name: string; email: string; department: string };
    leaveType: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Shift a UTC Date to its IST "virtual UTC" for date-field extraction */
const toISTVirtual = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS);

const formatDate = (date?: string | Date) => {
  if (!date) return "—";
  const d = new Date(date);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
};

const formatDateOnly = (date?: string | Date) => {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day:   "2-digit",
    month: "2-digit",
    year:  "numeric",
    timeZone: "Asia/Kolkata"
  });
};

const isToday = (date?: string | Date) => {
  if (!date) return false;
  const d = new Date(date);
  if (isNaN(d.getTime())) return false;
  // Compare IST calendar dates
  const dIST     = toISTVirtual(d);
  const todayIST = toISTVirtual(new Date());
  return (
    dIST.getUTCFullYear() === todayIST.getUTCFullYear() &&
    dIST.getUTCMonth()    === todayIST.getUTCMonth()    &&
    dIST.getUTCDate()     === todayIST.getUTCDate()
  );
};

const formatTime = (date?: string | Date) => {
  if (!date) return "--";
  const d = new Date(date);
  return isNaN(d.getTime())
    ? "--"
    : d.toLocaleTimeString("en-IN", {
        hour:     "2-digit",
        minute:   "2-digit",
        timeZone: "Asia/Kolkata"
      });
};

const getDateField = (item: any) => {
  return item.checkIn || item.timestamp || item.date || null;
};

function Badge({ status }: { status: string }) {
    const s = status?.toLowerCase().replace(/[\s-]/g, '');
    const mapping: Record<string, string> = {
        active:   'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        inactive: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
        pending:  'bg-amber-500/10 text-amber-500 border-amber-500/20',
        approved: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        rejected: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
        present:  'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        absent:   'bg-rose-500/10 text-rose-500 border-rose-500/20',
        late:     'bg-amber-500/10 text-amber-500 border-amber-500/20',
        halfday:  'bg-blue-500/10 text-blue-500 border-blue-500/20',
        halfDay:  'bg-blue-500/10 text-blue-500 border-blue-500/20',
    };

    return (
        <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wide border ${mapping[s] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'}`}>
            {status}
        </span>
    );
}

// ── Modals ────────────────────────────────────────────────────────────────────
function EmployeeModal({ onClose, onSave, employee }: { onClose: () => void; onSave: (d: any) => Promise<void>; employee?: Employee }) {
    const [form, setForm] = useState<any>(employee || { name: '', email: '', role: 'employee' });
    const [saving, setSaving] = useState(false);

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl w-full max-w-lg border border-gray-100 dark:border-zinc-800 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in duration-300">
                <div className="p-10 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between bg-gradient-to-br from-blue-600 to-violet-700 text-white">
                    <div>
                        <h2 className="text-xl font-bold tracking-tight">{employee ? 'Update Identity' : 'Commission Employee'}</h2>
                        <p className="text-[10px] uppercase font-bold tracking-widest opacity-70 mt-1">Workforce Intelligence Unit</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all">✕</button>
                </div>
                <form className="p-10 space-y-6" onSubmit={async (e) => { e.preventDefault(); setSaving(true); try { await onSave(form); onClose(); } catch(err: any) { alert(err.message); } finally { setSaving(false); } }}>
                    <div className="space-y-4">
                        <div className="group">
                            <label className="text-[11px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest mb-2 block">Full Name</label>
                            <input 
                                placeholder="e.g. John Doe" 
                                className="w-full h-14 px-5 rounded-2xl border-2 dark:border-zinc-800 dark:bg-black focus:border-blue-500 outline-none transition-all font-semibold text-[13px]" 
                                value={form.name} 
                                onChange={(e) => setForm({ ...form, name: e.target.value })} 
                                required 
                            />
                        </div>
                        <div className="group">
                            <label className="text-[11px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest mb-2 block">Enterprise Email</label>
                            <input 
                                placeholder="name@company.com" 
                                type="email" 
                                className="w-full h-14 px-5 rounded-2xl border-2 dark:border-zinc-800 dark:bg-black focus:border-blue-500 outline-none transition-all font-semibold text-[13px]" 
                                value={form.email} 
                                onChange={(e) => setForm({ ...form, email: e.target.value })} 
                                required 
                            />
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                            <div className="group">
                                <label className="text-[11px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest mb-2 block">Strategic Role</label>
                                <select 
                                    className="w-full h-14 px-5 rounded-2xl border-2 dark:border-zinc-800 dark:bg-black focus:border-blue-500 outline-none transition-all font-semibold text-[13px] appearance-none bg-none" 
                                    value={form.role} 
                                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                                >
                                    <option value="employee">Employee / Contributor</option>
                                    <option value="hr">HR Administrator</option>
                                    <option value="admin">System Admin</option>
                                    <option value="manager">Project Manager</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex gap-4 pt-6">
                        <button type="button" onClick={onClose} className="flex-1 h-14 rounded-2xl border-2 font-bold uppercase text-[11px] tracking-wider hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all">Cancel</button>
                        <button type="submit" disabled={saving} className="flex-1 h-14 rounded-2xl bg-blue-600 text-white font-bold uppercase text-[11px] tracking-wider shadow-xl shadow-blue-500/20 transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-50">
                            {saving ? 'Processing...' : employee ? 'Update Record' : 'Create Record'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function HRMSPage() {
    const [activeTab, setActiveTab] = useState<'employees' | 'attendance' | 'leave' | 'departments'>('employees');
    const [stats, setStats] = useState<HrmsStats | null>(null);
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<any>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // Use hrmsApi.stats() which now calls root /api/hrms with unified data
            const res = await hrmsApi.stats().catch(() => null);
            const unifiedData = res?.data || res;
            
            if (unifiedData) {
                // Update stats
                setStats({
                    totalEmployees: unifiedData.totalWorkforce ?? 0,
                    activeEmployees: unifiedData.activeDeployment ?? 0,
                    departmentsCount: unifiedData.departmentsCount ?? 0,
                    pendingLeaves: unifiedData.attendanceToday ?? 0, // Using attendanceToday for the 4th stat
                });

                // For employees tab, use the employees list from unified response
                if (activeTab === 'employees') {
                    setData(unifiedData.employees || []);
                } else {
                    // For other tabs, fetch specific data
                    let tabRes: any;
                    if (activeTab === 'departments') tabRes = await hrmsApi.getDepartments();
                    else if (activeTab === 'attendance') tabRes = await hrmsApi.getAttendance();
                    else if (activeTab === 'leave') tabRes = await hrmsApi.getLeaves();

                    setData(Array.isArray(tabRes?.data) ? tabRes.data : Array.isArray(tabRes) ? tabRes : []);
                }
            }
        } catch (err) {
            console.error('[HRMS] fetchData error:', err);
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [activeTab, search]);

    const router = useRouter();

    useEffect(() => {
        const userRaw = localStorage.getItem("user");
        const user = userRaw ? JSON.parse(userRaw) : null;
        const roleStr = (user?.role?.name || user?.role || '').toLowerCase();
        if (user && !["admin", "hr", "manager"].includes(roleStr)) {
            router.push("/dashboard");
        }
    }, [router]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleLeaveAction = async (id: string, status: string) => {
        try {
            await hrmsApi.updateLeaveStatus(id, { status });
            fetchData();
        } catch (err: any) {
            alert(err.message);
        }
    };

    return (
        <div id="hrms-page-root" className="w-full text-gray-900 dark:text-white space-y-10 pb-12 overflow-x-hidden">
            {showModal && (
                <EmployeeModal 
                    onClose={() => { setShowModal(false); setEditing(null); }} 
                    onSave={async (d) => { 
                        editing ? await hrmsApi.updateEmployee(editing._id, d) : await hrmsApi.createEmployee(d); 
                        fetchData(); 
                    }} 
                    employee={editing} 
                />
            )}

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Workforce Hub</h1>
                    <p className="text-gray-500 dark:text-zinc-500 font-medium text-sm mt-1 max-w-md">Orchestrate your team&apos;s lifecycle, handle permissions, and monitor organizational health.</p>
                </div>
                <button 
                    id="add-employee-btn"
                    onClick={() => { setEditing(null); setShowModal(true); }} 
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3.5 rounded-2xl text-[11px] font-bold uppercase tracking-wider shadow-2xl shadow-blue-500/20 transition-all hover:-translate-y-1"
                >
                    ＋ Commission Team Member
                </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Total Workforce', value: stats?.totalEmployees ?? '0', color: 'text-blue-600', icon: '👥' },
                    { label: 'Active Deployment', value: stats?.activeEmployees ?? '0', color: 'text-emerald-600', icon: '⚡' },
                    { label: 'Strategic Units', value: stats?.departmentsCount ?? '0', color: 'text-violet-600', icon: '🏢' },
                    { label: 'Attendance Today', value: stats?.pendingLeaves ?? '0', color: 'text-rose-600', icon: '⏳' },
                ].map((s) => (
                    <div key={s.label} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800/50 rounded-3xl p-8 shadow-sm transition-all hover:shadow-xl hover:border-blue-500/20 group">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-2xl brightness-110 group-hover:scale-110 transition-transform">{s.icon}</span>
                            <p className="text-[11px] font-semibold text-gray-500 dark:text-zinc-500 uppercase tracking-widest">{s.label}</p>
                        </div>
                        <h2 className={`text-3xl font-bold ${s.color}`}>{s.value}</h2>
                    </div>
                ))}
            </div>

            <div className="flex gap-4 border-b border-gray-200 dark:border-zinc-800/50 overflow-x-auto scrollbar-hide">
                {(['employees', 'attendance', 'leave', 'departments'] as const).map((t) => (
                    <button 
                        key={t} 
                        onClick={() => setActiveTab(t)} 
                        className={`px-6 py-4 text-[11px] font-bold uppercase tracking-wider transition-all -mb-px border-b-2 whitespace-nowrap ${activeTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-gray-200'}`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            <div className="space-y-6">
                {activeTab === 'employees' && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-4 bg-white dark:bg-zinc-900 p-2 rounded-2xl border border-gray-100 dark:border-zinc-800 max-w-md">
                            <input 
                                type="text" 
                                placeholder="Search by name, email or role..." 
                                value={search} 
                                onChange={(e) => setSearch(e.target.value)} 
                                className="flex-1 px-4 py-2 bg-transparent outline-none text-[13px] font-semibold" 
                            />
                            <div className="p-2 bg-gray-50 dark:bg-zinc-800 rounded-xl text-gray-400">🔍</div>
                        </div>
                        
                        <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/50 rounded-[2rem] overflow-hidden shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50/50 dark:bg-zinc-800/30 text-left border-b border-gray-100 dark:border-zinc-800">
                                        <tr>
                                            <th className="px-8 py-5 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-zinc-500">Internal Identity</th>
                                            <th className="px-8 py-5 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-zinc-500">Unit / Dept</th>
                                            <th className="px-8 py-5 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-zinc-500">Operational Role</th>
                                            <th className="px-8 py-5 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-zinc-500">Status</th>
                                            <th className="px-8 py-5 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-zinc-500 text-right">Protocol</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 dark:divide-zinc-800/50">
                                        {loading ? (
                                            <tr><td colSpan={5} className="py-20"><div className="flex justify-center"><div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div></div></td></tr>
                                        ) : data.length === 0 ? (
                                            <tr><td colSpan={5} className="text-center py-20 text-gray-400 dark:text-zinc-500 text-sm font-medium italic">No personnel found in current sector.</td></tr>
                                        ) : data.map((emp, index) => (
                                            <tr key={emp._id || emp.id || index} className="hover:bg-gray-50/50 dark:hover:bg-zinc-800/20 transition-all group">
                                                <td className="px-8 py-5">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-semibold text-base">
                                                            {emp?.name?.charAt(0) || "?"}
                                                        </div>
                                                        <div>
                                                            <p className="text-[13px] font-semibold text-gray-800 dark:text-white">{emp?.name || "—"}</p>
                                                            <p className="text-[11px] font-medium text-gray-500 dark:text-zinc-500 group-hover:text-blue-500 transition-colors">{emp?.email || "—"}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5 text-[13px] font-semibold text-gray-600 dark:text-zinc-400">{emp?.department?.name || emp?.department || "General"}</td>
                                                <td className="px-8 py-5"><span className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-[11px] font-bold uppercase tracking-wider text-zinc-500">{emp?.role || "—"}</span></td>
                                                <td className="px-8 py-5"><Badge status={emp?.status || "Inactive"} /></td>
                                                <td className="px-8 py-5 text-right">
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => { setEditing(emp); setShowModal(true); }} className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 rounded-xl transition-all">✏️</button>
                                                        <button onClick={async () => { if (confirm('Purge identity record?')) { await hrmsApi.deleteEmployee(emp._id); fetchData(); } }} className="p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500 rounded-xl transition-all">🗑️</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'attendance' && (
                    <div className="space-y-6">
                        {/* Attendance Analytics Row */}
                        {!loading && data.length > 0 && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="lg:col-span-1 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/50 rounded-[2rem] p-8 shadow-sm">
                                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-6">Status Distribution</h3>
                                    <div className="h-[200px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={[
                                                        { name: 'Present', value: data.filter(a => a.status === 'Present').length, color: '#10b981' },
                                                        { name: 'Late', value: data.filter(a => a.status === 'Late').length, color: '#f59e0b' },
                                                        { name: 'Absent', value: data.filter(a => a.status === 'Absent').length, color: '#ef4444' },
                                                        { name: 'Half Day', value: data.filter(a => a.status === 'Half Day').length, color: '#3b82f6' },
                                                    ].filter(x => x.value > 0)}
                                                    innerRadius={60}
                                                    outerRadius={80}
                                                    paddingAngle={5}
                                                    dataKey="value"
                                                >
                                                    {([] as any).concat([
                                                        { name: 'Present', value: 0, color: '#10b981' },
                                                        { name: 'Late', value: 0, color: '#f59e0b' },
                                                        { name: 'Absent', value: 0, color: '#ef4444' },
                                                        { name: 'Half Day', value: 0, color: '#3b82f6' },
                                                    ]).map((entry: any, index: number) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip 
                                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="mt-4 grid grid-cols-2 gap-2">
                                        {[
                                            { label: 'Present', color: 'bg-emerald-500', count: data.filter(a => a.status === 'Present').length },
                                            { label: 'Late', color: 'bg-amber-500', count: data.filter(a => a.status === 'Late').length },
                                            { label: 'Absent', color: 'bg-rose-500', count: data.filter(a => a.status === 'Absent').length },
                                            { label: 'Half Day', color: 'bg-blue-500', count: data.filter(a => a.status === 'Half Day').length },
                                        ].map(item => (
                                            <div key={item.label} className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${item.color}`} />
                                                <span className="text-[10px] font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-widest">{item.label}: {item.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/50 rounded-[2rem] p-8 shadow-sm flex flex-col justify-center">
                                    <div className="flex items-center gap-6">
                                        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center text-3xl">📊</div>
                                        <div>
                                            <h3 className="text-[13px] font-bold text-gray-800 dark:text-white uppercase tracking-widest">Active Monitoring</h3>
                                            <p className="text-sm font-medium text-gray-500 dark:text-zinc-500 mt-1">Real-time attendance logs for the current organizational cycle.</p>
                                        </div>
                                    </div>
                                    <div className="mt-8 grid grid-cols-3 gap-4">
                                        <div className="p-4 bg-gray-50 dark:bg-zinc-800/50 rounded-2xl border border-gray-100 dark:border-zinc-800">
                                            <p className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest mb-1">Avg Clock-in</p>
                                            <p className="text-xl font-bold text-gray-900 dark:text-white">09:12 AM</p>
                                        </div>
                                        <div className="p-4 bg-gray-50 dark:bg-zinc-800/50 rounded-2xl border border-gray-100 dark:border-zinc-800">
                                            <p className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest mb-1">On-Time Rate</p>
                                            <p className="text-xl font-bold text-emerald-500">84%</p>
                                        </div>
                                        <div className="p-4 bg-gray-50 dark:bg-zinc-800/50 rounded-2xl border border-gray-100 dark:border-zinc-800">
                                            <p className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest mb-1">Active Now</p>
                                            <p className="text-xl font-bold text-blue-500">{data.filter(a => a.checkIn && !a.checkOut).length}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/50 rounded-[2rem] overflow-hidden shadow-sm">
                                <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50/50 dark:bg-zinc-800/30 border-b border-gray-100 dark:border-zinc-800 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-zinc-500">
                                    <tr>
                                        <th className="px-8 py-5">Personnel</th>
                                        <th className="px-8 py-5">Date (IST)</th>
                                        <th className="px-8 py-5">In / Out (IST)</th>
                                        <th className="px-8 py-5">Hours</th>
                                        <th className="px-8 py-5">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-zinc-800/50">
                                        {(() => {
                                            console.log("[HRMS] RAW ATTENDANCE DATA:", data);
                                            
                                            const normalizedData = (data || []).map((item: any) => ({
                                                _id:        item._id || item.id,
                                                name:       item.name || item.user?.name || item.employeeName || "Unknown",
                                                email:      item.email || item.user?.email || "—",
                                                checkIn:    item.checkIn  || item.clockIn  || item.inTime  || item.timestamp || null,
                                                checkOut:   item.checkOut || item.clockOut || item.outTime || null,
                                                status:     item.status || "UNKNOWN",
                                                workingHours: typeof item.workingHours === 'number' ? item.workingHours : null,
                                                dateRecord: item.date || item.timestamp || item.checkIn
                                            }));

                                            const todayAttendance = normalizedData.filter((item: any) => {
                                                return item.checkIn && isToday(item.checkIn);
                                            });
                                            
                                            console.log("[HRMS] TODAY ATTENDANCE:", todayAttendance);

                                            if (todayAttendance.length === 0) {
                                                return <tr><td colSpan={5} className="text-center text-gray-400 dark:text-zinc-500 text-sm font-medium py-20 italic">No attendance recorded for today.</td></tr>;
                                            }

                                            return todayAttendance.map((a: any, index: number) => (
                                                <tr key={a._id || index} className="hover:bg-gray-50/50 dark:hover:bg-zinc-800/20 transition-all">
                                                    <td className="px-8 py-5">
                                                        <p className="text-[13px] font-semibold text-gray-900 dark:text-white">{a.name}</p>
                                                        <p className="text-[11px] font-medium text-gray-500 dark:text-zinc-500">{a.email}</p>
                                                    </td>
                                                    <td className="px-8 py-5 font-medium">{formatDateOnly(a.dateRecord)}</td>
                                                    <td className="px-8 py-5 font-medium text-gray-500">
                                                        <span className="text-emerald-500">{formatTime(a.checkIn)}</span>
                                                        <span className="mx-2 opacity-30">/</span>
                                                        <span className="text-rose-500">{a.checkOut ? formatTime(a.checkOut) : <span className="text-amber-500 italic text-[11px]">active</span>}</span>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        {a.workingHours !== null
                                                            ? <span className="font-bold text-gray-700 dark:text-zinc-200">{a.workingHours}h</span>
                                                            : <span className="text-gray-400 dark:text-zinc-500 italic text-[11px]">in progress</span>
                                                        }
                                                    </td>
                                                    <td className="px-8 py-5"><Badge status={a.status} /></td>
                                                </tr>
                                            ));
                                        })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'leave' && (
                    <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/50 rounded-[2rem] overflow-hidden shadow-sm">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50/50 dark:bg-zinc-800/30 border-b border-gray-100 dark:border-zinc-800 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-zinc-500">
                                <tr>
                                    <th className="px-8 py-5">Applicant</th>
                                    <th className="px-8 py-5">Classification</th>
                                    <th className="px-8 py-5">Window</th>
                                    <th className="px-8 py-5">Status</th>
                                    <th className="px-8 py-5 text-right">Authorization</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-zinc-800/50">
                                {data.map((l: any, index: number) => (
                                    <tr key={l._id || l.id || index} className="hover:bg-gray-50/50 dark:hover:bg-zinc-800/20 transition-all">
                                        <td className="px-8 py-5 text-[13px] font-semibold text-gray-900 dark:text-white">{l.user?.name || "—"}</td>
                                        <td className="px-8 py-5"><span className="px-3 py-1 bg-gray-100 dark:bg-zinc-800 rounded-lg text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">{l.leaveType}</span></td>
                                        <td className="px-8 py-5 text-[13px] font-semibold">{formatDateOnly(l.startDate)} - {formatDateOnly(l.endDate)}</td>
                                        <td className="px-8 py-5"><Badge status={l.status} /></td>
                                        <td className="px-8 py-5 text-right">
                                            {l.status?.toLowerCase() === 'pending' && (
                                                <div className="flex justify-end gap-3">
                                                    <button onClick={() => handleLeaveAction(l._id, 'Approved')} className="px-4 py-2 bg-emerald-500/10 text-emerald-500 rounded-xl text-[11px] font-bold uppercase tracking-wider hover:bg-emerald-500 hover:text-white transition-all">Authorize</button>
                                                    <button onClick={() => handleLeaveAction(l._id, 'Rejected')} className="px-4 py-2 bg-rose-500/10 text-rose-500 rounded-xl text-[11px] font-bold uppercase tracking-wider hover:bg-rose-500 hover:text-white transition-all">Decline</button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'departments' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {data.map((dept: Department) => (
                            <div key={dept._id} className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/50 rounded-[2rem] p-8 shadow-sm group hover:border-blue-500/20 transition-all">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-[13px] font-bold text-gray-800 dark:text-white uppercase tracking-widest">{dept.name || "—"}</h3>
                                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center font-bold">
                                        {dept?.name?.charAt(0) || "?"}
                                    </div>
                                </div>
                                <p className="text-sm font-medium text-gray-500 dark:text-zinc-500 line-clamp-2">{dept.description || 'No operational brief provided.'}</p>
                                <div className="mt-8 pt-6 border-t border-gray-100 dark:border-zinc-800/50 flex justify-end">
                                    <button onClick={async () => { if (confirm('Disband unit?')) { await hrmsApi.deleteDepartment(dept._id); fetchData(); } }} className="text-[11px] font-bold uppercase tracking-wider text-rose-500 hover:text-white hover:bg-rose-500 px-4 py-2 rounded-xl transition-all">Disband</button>
                                </div>
                            </div>
                        ))}
                        <button 
                            onClick={() => { const name = prompt('Unit Name?'); if (name) hrmsApi.createDepartment({ name }).then(fetchData); }} 
                            className="bg-transparent border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-[2rem] p-10 flex flex-col items-center justify-center text-gray-400 hover:text-blue-500 hover:border-blue-500 transition-all hover:bg-blue-50/10"
                        >
                            <span className="text-3xl mb-2">＋</span>
                            <span className="text-[11px] font-bold uppercase tracking-wider">Establish Unit</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}