'use strict';

const { getISTDayStart, getIST7PMThreshold, isSameISTDay } = require('./istTime');

/**
 * enforceAutoLogout
 * ─────────────────
 * Handles auto-checkout at 7:00 PM IST while preserving industry-standard UTC storage.
 */
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

        // ── STATUS RULE: Half Day overrides Late/Present ──────────────────────
        if (hours < 4) {
            record.status = 'Half Day';
        }
        // Original status (Late/Present) is preserved if >= 4 hours.

        console.log(`DEBUG [AutoLogoutHelper] recordId=${record._id} hours=${hours} status=${record.status}`);

        if (typeof record.save === 'function') {
            await record.save();
        }
    }

    return record;
};

module.exports = { enforceAutoLogout };
