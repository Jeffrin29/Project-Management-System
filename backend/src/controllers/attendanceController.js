'use strict';

const Attendance = require('../models/Attendance');
const HrEmployee = require('../models/HrEmployee');
const Leave = require('../models/Leave');
const { logActivity } = require('../services/activityService');
const { successResponse, errorResponse } = require('../utils/helpers');
const { enforceAutoLogout } = require('../utils/attendanceHelper');
const {
    getISTDayStart,
    getISTDayEnd,
    getIST930AM,
    getIST10AM,
    getISTHour,
    getISTMinutes,
} = require('../utils/istTime');

// POST /attendance/checkin
exports.checkIn = async (req, res) => {
    try {
        const now  = new Date();
        // Use IST-aware day boundaries so that "today" is correct even in UTC Docker
        const start = getISTDayStart(now);
        const end   = getISTDayEnd(now);

        const { organizationId, userId } = req.user;

        const existing = await Attendance.findOne({
            user: userId,
            ...req.orgFilter,
            date: { $gte: start, $lte: end }
        });

        if (existing) {
            return errorResponse(res, 'Already checked in today', 400);
        }

        // ── Attendance Status Rules (IST) ──────────────────────────────────────
        // 9:30 AM IST → 10:00 AM IST → Present
        // After 10:00 AM IST              → Late
        const ist930  = getIST930AM(now);   // 9:30 AM IST as UTC
        const ist10AM = getIST10AM(now);    // 10:00 AM IST as UTC

        let status = 'Present';
        let late   = false;

        if (now > ist10AM) {
            // Checked in after 10:00 AM IST
            status = 'Late';
            late   = true;
        } else if (now >= ist930) {
            // Checked in between 9:30 and 10:00 AM IST
            status = 'Present';
            late   = false;
        } else {
            // Checked in before 9:30 AM IST — still Present (early bird)
            status = 'Present';
            late   = false;
        }

        const checkInHour = getISTHour(now);
        const checkInMin  = getISTMinutes(now);
        console.log(`[CheckIn] userId=${userId} IST time=${checkInHour}:${String(checkInMin).padStart(2,'0')} status=${status}`);

        const emp = await HrEmployee.findOne({ userId, organizationId });

        const record = await Attendance.create({
            user:           userId,
            employeeId:     emp?._id || null,
            organizationId,
            date:           now,   // stored as UTC (MongoDB standard)
            checkIn:        now,
            status,
            late,
            workingHours:   0
        });

        await logActivity({
            userId,
            organizationId,
            action:      'attendance:check-in',
            entityType:  'attendance',
            entityId:     record._id,
            description: `Check-in at ${checkInHour}:${String(checkInMin).padStart(2,'0')} IST — Status: ${status}`
        });

        return successResponse(res, record, 'Checked in successfully');
    } catch (err) {
        console.error('[CheckIn] Error:', err);
        return errorResponse(res, err.message, 500);
    }
};

// POST /attendance/checkout
exports.checkOut = async (req, res) => {
    try {
        const now   = new Date();
        const start = getISTDayStart(now);
        const end   = getISTDayEnd(now);

        const { userId, organizationId } = req.user;

        const record = await Attendance.findOne({
            user: userId,
            ...req.orgFilter,
            date: { $gte: start, $lte: end }
        });

        if (!record) {
            return errorResponse(res, 'No check-in record found for today', 404);
        }
        if (record.checkOut) {
            return errorResponse(res, 'Already checked out', 400);
        }

        record.checkOut = now;

        // ── Working Hours Calculation ──────────────────────────────────────────
        // Both checkIn and checkOut are stored as UTC timestamps in MongoDB.
        // Simple millisecond subtraction is timezone-safe.
        const diffMs = record.checkOut.getTime() - new Date(record.checkIn).getTime();
        const hours  = parseFloat(Math.max(0, diffMs / (1000 * 60 * 60)).toFixed(1));
        record.workingHours = hours;

        // ── Final Status Logic ─────────────────────────────────────────────────
        // Half Day overrides Present / Late; Late is already set from checkIn
        if (hours < 4) {
            record.status = 'Half Day';
        }
        // else: keep status from check-in (Present or Late)

        await record.save();

        const checkOutHour = getISTHour(now);
        const checkOutMin  = getISTMinutes(now);

        await logActivity({
            userId,
            organizationId,
            action:      'attendance:check-out',
            entityType:  'attendance',
            entityId:     record._id,
            description: `Check-out at ${checkOutHour}:${String(checkOutMin).padStart(2,'0')} IST — Hours: ${hours}h — Status: ${record.status}`
        });

        return successResponse(res, record, 'Checked out successfully');
    } catch (err) {
        console.error('[CheckOut] Error:', err);
        return errorResponse(res, err.message, 500);
    }
};

// GET /attendance/my
exports.getMyAttendance = async (req, res) => {
    try {
        const { userId } = req.user;

        const filter = {
            $or: [
                { user:       userId },
                { employeeId: userId } // legacy support
            ],
            ...req.orgFilter
        };

        const records = await Attendance.find(filter).sort({ date: -1 });
        const processed = await Promise.all(records.map(r => enforceAutoLogout(r)));

        return successResponse(res, processed || [], 'Attendance log fetched');
    } catch (err) {
        return errorResponse(res, err.message, 500);
    }
};

// ─── Attendance Stats (Dashboard) ─────────────────────────────────────────────
exports.getAttendanceStats = async (req, res) => {
    try {
        const { userId, organizationId } = req.user;
        const now = new Date();

        // Month boundaries in IST
        const istNow          = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
        const year            = istNow.getUTCFullYear();
        const month           = istNow.getUTCMonth();        // 0-indexed
        const todayDateIST    = istNow.getUTCDate();

        // First moment of this IST month (as UTC)
        const istMonthStart   = new Date(Date.UTC(year, month, 1) - 5.5 * 60 * 60 * 1000);
        // First moment of next IST month (as UTC)
        const istMonthEnd     = new Date(Date.UTC(year, month + 1, 1) - 5.5 * 60 * 60 * 1000);

        console.log(`[AttendanceStats] userId=${userId} IST period: ${istMonthStart.toISOString()} → ${istMonthEnd.toISOString()}`);

        const monthlyRecords = await Attendance.find({
            user: userId,
            organizationId,
            date: { $gte: istMonthStart, $lt: istMonthEnd }
        });

        await Promise.all(monthlyRecords.map(r => enforceAutoLogout(r)));

        const presentStatuses = ['Present', 'Late', 'Half Day'];
        const presentDays = monthlyRecords.filter(r => r.checkIn && presentStatuses.includes(r.status)).length;

        // Working days calculation for current IST month up to today
        let workingDays = 0;
        for (let d = 1; d <= todayDateIST; d++) {
            const dateObj  = new Date(Date.UTC(year, month, d));
            const dayOfWeek = dateObj.getUTCDay();
            let isHoliday   = (dayOfWeek === 0); // Sunday
            if (dayOfWeek === 6) {
                const weekNum = Math.ceil(d / 7);
                if (weekNum === 2 || weekNum === 4) isHoliday = true;
            }
            if (!isHoliday) workingDays++;
        }

        const attendancePercentage = workingDays > 0 ? (presentDays / workingDays) * 100 : 0;

        const [monthlyLeaves, pendingRequests] = await Promise.all([
            Leave.countDocuments({
                user: userId,
                organizationId,
                startDate: { $lte: istMonthEnd },
                endDate:   { $gte: istMonthStart },
                status:    'Approved'
            }),
            Leave.countDocuments({ user: userId, organizationId, status: 'Pending' })
        ]);

        const stats = {
            presentDays,
            workingDays,
            attendancePercentage: Math.round(attendancePercentage),
            monthlyLeaves,
            pendingRequests
        };

        console.log(`[AttendanceStats] Result for ${userId}:`, stats);
        return successResponse(res, stats, 'Attendance stats fetched');
    } catch (err) {
        console.error('[AttendanceStats] Error:', err);
        return errorResponse(res, err.message, 500);
    }
};

// ─── Monthly Chart Data ────────────────────────────────────────────────────────
exports.getMonthlyChart = async (req, res) => {
    try {
        const { userId, organizationId } = req.user;
        const now = new Date();

        // Compute IST month boundaries
        const istNow        = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
        const year          = istNow.getUTCFullYear();
        const month         = istNow.getUTCMonth();
        const daysInMonth   = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const istMonthStart = new Date(Date.UTC(year, month, 1)     - 5.5 * 60 * 60 * 1000);
        const istMonthEnd   = new Date(Date.UTC(year, month + 1, 1) - 5.5 * 60 * 60 * 1000);
        // Today's IST date string YYYY-MM-DD
        const todayISTStr   = `${year}-${String(month + 1).padStart(2, '0')}-${String(istNow.getUTCDate()).padStart(2, '0')}`;

        const records = await Attendance.find({
            user: userId,
            organizationId,
            date: { $gte: istMonthStart, $lt: istMonthEnd }
        }).lean();

        // Map records by IST date key
        const recordMap = new Map();
        for (const r of records) {
            const rIST = new Date(new Date(r.date).getTime() + 5.5 * 60 * 60 * 1000);
            const key  = `${rIST.getUTCFullYear()}-${String(rIST.getUTCMonth() + 1).padStart(2, '0')}-${String(rIST.getUTCDate()).padStart(2, '0')}`;
            recordMap.set(key, r);
        }

        const chartData = [];
        for (let d = 1; d <= daysInMonth; d++) {
            const dayStr    = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dateObj   = new Date(Date.UTC(year, month, d));
            const dayOfWeek = dateObj.getUTCDay();

            let status = 'absent';

            if (dayOfWeek === 0) {
                status = 'holiday';
            } else if (dayOfWeek === 6) {
                const weekNum = Math.ceil(d / 7);
                if (weekNum === 2 || weekNum === 4) status = 'holiday';
            }

            const record = recordMap.get(dayStr);
            if (record && record.checkIn) {
                status = record.status.toLowerCase();
            } else if (dayStr > todayISTStr) {
                status = 'pending';
            }

            chartData.push({ date: dayStr, status });
        }

        return successResponse(res, chartData || [], 'Chart data fetched');
    } catch (err) {
        return errorResponse(res, err.message, 500);
    }
};
