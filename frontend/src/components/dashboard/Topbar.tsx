"use client";
import { FaSearch, FaBell, FaUserCircle, FaBars } from "react-icons/fa";
import ThemeToggle from "./ThemeToggle";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { attendanceApi } from "../../lib/api";

export default function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const router = useRouter();
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    setUserName(user.name || "User");
  }, []);

  const fetchAttendance = useCallback(async () => {
    try {
      const res = await attendanceApi.getHistory();
      const records = Array.isArray(res?.data?.data)
        ? res.data.data
        : Array.isArray(res?.data)
          ? res.data
          : [];
      setAttendance(records);
    } catch (err) {
      console.error("Failed to fetch attendance in topbar", err);
    }
  }, []);

  useEffect(() => {
    fetchAttendance();
    window.addEventListener("attendanceUpdated", fetchAttendance);
    return () => window.removeEventListener("attendanceUpdated", fetchAttendance);
  }, [fetchAttendance]);

  const todayRecord = attendance.find((a) => {
    const d = new Date(a.date);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });
  const isCheckedIn = !!todayRecord && !!todayRecord.checkIn;
  const isCheckedOut = !!todayRecord?.checkOut;

  const handleClockIn = async () => {
    setLoading(true);
    try {
      await attendanceApi.checkIn();
      fetchAttendance();
      window.dispatchEvent(new Event("attendanceUpdated"));
    } catch (err: any) {
      alert(err.message || "Clock-in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    setLoading(true);
    try {
      await attendanceApi.checkOut();
      fetchAttendance();
      window.dispatchEvent(new Event("attendanceUpdated"));
    } catch (err: any) {
      alert(err.message || "Clock-out failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between h-16 sticky top-0 z-50 backdrop-blur-xl bg-white/15 supports-[backdrop-filter]:bg-white/10 px-4 sm:px-6 gap-3 border-b border-white/20 shadow-[0_8px_32px_rgba(31,38,135,0.07)] transition-all duration-300">

      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        className="md:hidden p-2.5 rounded-full text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/20 transition-all duration-300 flex-shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center shadow-sm"
        aria-label="Open sidebar"
      >
        <FaBars size={16} />
      </button>

      {/* Search bar */}
      <div className="flex items-center bg-white/20 dark:bg-zinc-900/40 backdrop-blur-md border border-white/20 dark:border-zinc-800 rounded-2xl px-4 py-2 w-full max-w-xs sm:max-w-sm transition-all duration-300 focus-within:border-blue-400/50 focus-within:ring-4 focus-within:ring-blue-400/10 shadow-sm">
        <FaSearch className="text-zinc-500 dark:text-zinc-500 mr-2 flex-shrink-0" size={13} />
        <input
          placeholder="Search..."
          className="bg-transparent outline-none text-sm w-full text-zinc-800 dark:text-zinc-200 placeholder-zinc-500 font-medium"
        />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0 ml-auto">

        {/* Attendance status widget */}
        <div className="hidden sm:flex items-center gap-4 bg-white/15 dark:bg-zinc-900/30 backdrop-blur-lg px-4 py-2 rounded-2xl border border-white/20 dark:border-zinc-800 shadow-sm transition-all duration-300 hover:shadow-md">
          {todayRecord ? (
            <div className="flex gap-4 items-center">
              <div
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.5)] ${todayRecord.checkOut
                    ? "bg-blue-500"
                    : "bg-emerald-500 animate-pulse"
                  }`}
              />
              <div className="flex flex-col">
                <p className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 tracking-wider leading-none mb-1">
                  {todayRecord.checkOut ? "Status: Done" : "Status: In"}
                </p>
                <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100">
                  {new Date(todayRecord.checkIn).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              {todayRecord.checkOut && (
                <div className="pl-4 border-l border-white/30 dark:border-zinc-800">
                  <p className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 tracking-wider leading-none mb-1">
                    Out
                  </p>
                  <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100">
                    {new Date(todayRecord.checkOut).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              <p className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 tracking-wider leading-none mb-1">
                Status
              </p>
              <p className="text-xs font-bold text-zinc-400">Offline</p>
            </div>
          )}

          <div className="pl-4 ml-1 border-l border-white/30 dark:border-zinc-800">
            {isCheckedOut ? (
              <button
                disabled
                className="px-4 py-1.5 bg-white/10 dark:bg-zinc-800 text-zinc-400 rounded-xl text-xs font-bold cursor-not-allowed border border-white/10"
              >
                Done
              </button>
            ) : isCheckedIn ? (
              <button
                id="clock-out-btn"
                disabled={loading}
                onClick={handleClockOut}
                className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-bold transition-all duration-300 min-h-[32px] min-w-[80px] shadow-sm hover:shadow-red-500/20"
              >
                {loading ? "..." : "Clock Out"}
              </button>
            ) : (
              <button
                id="clock-in-btn"
                disabled={loading}
                onClick={handleClockIn}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all duration-300 min-h-[32px] min-w-[80px] shadow-sm hover:shadow-emerald-500/20"
              >
                {loading ? "..." : "Clock In"}
              </button>
            )}
          </div>
        </div>

        {/* Theme toggle container */}
        <div className="bg-white/15 dark:bg-zinc-900/40 backdrop-blur-md border border-white/20 dark:border-zinc-800 rounded-full p-1.5 shadow-sm hover:bg-white/25 transition-all duration-300">
          <ThemeToggle />
        </div>

        {/* Bell */}
        <div
          className="relative cursor-pointer p-2.5 rounded-full bg-white/15 dark:bg-zinc-900/40 hover:bg-white/25 dark:hover:bg-zinc-800 backdrop-blur-md border border-white/20 dark:border-zinc-800 transition-all duration-300 min-h-[40px] min-w-[40px] flex items-center justify-center shadow-sm group"
          onClick={() => router.push("/dashboard/notifications")}
        >
          <FaBell className="text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" size={16} />
          <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-zinc-900 shadow-sm" />
        </div>

        {/* Profile */}
        <div
          className="flex items-center gap-3 cursor-pointer bg-white/15 dark:bg-zinc-900/40 hover:bg-white/25 dark:hover:bg-zinc-800 backdrop-blur-md border border-white/20 dark:border-zinc-800 px-3 py-1.5 rounded-full transition-all duration-300 min-h-[40px] shadow-sm group"
          onClick={() => router.push("/dashboard/profile")}
        >
          <span className="hidden sm:block text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate max-w-[100px]">
            {userName}
          </span>
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <FaUserCircle className="text-white text-xl" />
          </div>
        </div>

      </div>
    </div>
  );
}
