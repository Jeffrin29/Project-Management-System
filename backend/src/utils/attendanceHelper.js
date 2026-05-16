'use strict';

const { getISTDayStart, getIST7PMThreshold, isSameISTDay, getIST10AM } = require('./istTime');

/**
 * enforceAutoLogout
 * ─────────────────
 * Handles auto-checkout at 7:00 PM IST while preserving industry-standard UTC storage.
 */
const calculateAttendanceStatus = (record) => {
    if (!record || !record.checkIn) return 'Absent';

    // STEP 1: Check total hours worked first (if clocked out)
    if (record.checkOut && record.workingHours !== undefined && record.workingHours < 4) {
        return 'Half Day';
    }

    // STEP 2 & 3: If hours >= 4 or session in progress, check clock-in time
    // Rules: <= 10:00 AM (inclusive) -> PRESENT, > 10:00 AM -> LATE
    const checkInDate = new Date(record.checkIn);
    const threshold10AM = getIST10AM(checkInDate);

    if (checkInDate.getTime() > threshold10AM.getTime()) {
        return 'Late';
    }
    return 'Present';
};

const enforceAutoLogout = async (record) => {
    if (!record || record.checkOut || !record.checkIn) return record;

    const now = new Date();
    const checkInDate = new Date(record.checkIn);

    // ── CALCULATION RULE: Use UTC for Boundaries ──────────────────────────────
    // getIST7PMThreshold returns the UTC equivalent of 19:00 IST.
    const threshold7PMIST = getIST7PMThreshold(checkInDate);

    const recordISTDayStart = getISTDayStart(checkInDate);
    const todayISTDayStart  = getISTDayStart(now);

    const isPastISTDay      = recordISTDayStart < todayISTDayStart;
    const isTodayPast7PM    = isSameISTDay(checkInDate, now) && now >= threshold7PMIST;

    if (isPastISTDay || isTodayPast7PM) {
        // ── STORAGE RULE: Store UTC ───────────────────────────────────────────
        // We store the 7:00 PM IST mark as its UTC equivalent.
        record.checkOut     = threshold7PMIST;
        
        // ── CALCULATION RULE: Use Raw UTC getTime() ───────────────────────────
        const diffMs        = record.checkOut.getTime() - checkInDate.getTime();
        const hours         = parseFloat(Math.max(0, diffMs / (1000 * 60 * 60)).toFixed(1));
        record.workingHours = hours;

        // ── STATUS RULE: Apply centralized logic ──────────────────────────────
        record.status = calculateAttendanceStatus(record);
        record.late   = (record.status === 'Late');

        console.log(`DEBUG [AutoLogoutHelper] recordId=${record._id} hours=${hours} status=${record.status}`);

        if (typeof record.save === 'function') {
            await record.save();
        }
    }

    return record;
};

module.exports = { enforceAutoLogout, calculateAttendanceStatus };
