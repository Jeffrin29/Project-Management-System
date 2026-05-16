'use strict';

const moment = require('moment-timezone');

const Attendance = require('../models/Attendance');
const HrEmployee = require('../models/HrEmployee');
const Leave = require('../models/Leave');
const { logActivity } = require('../services/activityService');
const { successResponse, errorResponse } = require('../utils/helpers');
const { enforceAutoLogout, calculateAttendanceStatus } = require('../utils/attendanceHelper');
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
        // ── STORAGE RULE: MongoDB stores UTC ──────────────────────────────────
        // MongoDB stores all timestamps (date, checkIn, checkOut) in UTC.
        // This is the industry standard for distributed and containerized apps.
        // WE NEVER add timezone offsets manually before saving to DB.
        
        const now  = new Date(); // Raw UTC timestamp for storage
        const nowIST = moment().tz("Asia/Kolkata");
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

        // ── LOGIC RULE: Attendance Rules use IST ──────────────────────────────
        // Apply centralized status calculation logic
        let status = calculateAttendanceStatus({ checkIn: now });
        let late   = (status === 'Late');

        console.log(`[CheckIn] userId=${userId} IST time=${getISTHour(now)}:${String(getISTMinutes(now)).padStart(2,'0')} status=${status}`);

        const emp = await HrEmployee.findOne({ userId, organizationId });

        const attendanceData = {
            user:           userId,
            employeeId:     emp?._id || null,
            organizationId,
            date:           now, // Store actual UTC Date object
            checkIn:        now, // Store actual UTC Date object
            status,
            late,
            workingHours:   0
        };

        console.log("Attendance payload (Check-in):", attendanceData);

        let record;
        try {
            record = await Attendance.create(attendanceData);
        } catch (err) {
            console.error('[CheckIn] Database Save Error:', err);
            return errorResponse(res, 'Failed to save attendance record', 500);
        }

        await logActivity({
            userId,
            organizationId,
            action:      'attendance:check-in',
            entityType:  'attendance',
            entityId:     record._id,
            description: `Check-in at ${moment(record.checkIn).tz("Asia/Kolkata").format('hh:mm A')} IST — Status: ${status}`
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

        // ── CALCULATION RULE: Use Raw UTC getTime() ───────────────────────────
        // ALWAYS use raw UTC timestamps for working hours calculations.
        // NEVER convert to IST before subtraction. NEVER parse locale strings.
        const checkInTime = new Date(record.checkIn).getTime();
        const checkOutTime = now.getTime();
        
        const diffMs = checkOutTime - checkInTime;
        const workingHours = Math.max(0, diffMs / (1000 * 60 * 60));
        record.workingHours = Number(workingHours.toFixed(1));

        // ── STATUS RULE: Apply centralized logic ──────────────────────────────
        record.status = calculateAttendanceStatus(record);
        record.late   = (record.status === 'Late');

        console.log("DEBUG [CheckOut] before save:", {
            checkIn: record.checkIn,
            checkOut: record.checkOut,
            workingHours: record.workingHours,
            status: record.status,
            userId: record.user
        });

        try {
            await record.save();
        } catch (err) {
            console.error('[CheckOut] Database Save Error:', err);
            return errorResponse(res, 'Failed to update attendance record', 500);
        }

        await logActivity({
            userId,
            organizationId,
            action:      'attendance:check-out',
            entityType:  'attendance',
            entityId:     record._id,
            description: `Check-out at ${moment(record.checkOut).tz("Asia/Kolkata").format('hh:mm A')} IST — Hours: ${record.workingHours}h — Status: ${record.status}`
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

        const records = await Attendance.find(filter).sort({ date: -1 }).lean();
        const processed = await Promise.all(records.map(async r => {
            const logoutProcessed = await enforceAutoLogout(r);
            // Re-calculate status dynamically for ALL records (corrects existing ones on fetch)
            logoutProcessed.status = calculateAttendanceStatus(logoutProcessed);
            logoutProcessed.late   = (logoutProcessed.status === 'Late');
            return logoutProcessed;
        }));

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
