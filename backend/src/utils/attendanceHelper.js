'use strict';

const { getISTDayStart, getIST7PMThreshold, isSameISTDay } = require('./istTime');

/**
 * Auto check-out logic (IST-safe)
 * --------------------------------
 * If a record has checkIn but no checkOut, and either:
 *   - The check-in was on a PAST IST calendar day, OR
 *   - It is the same IST day AND current time is >= 7:00 PM IST
 *
 * Then: set checkOut = 7:00 PM IST (of the check-in day), recalculate
 *       workingHours, and apply Half Day rule if needed.
 *
 * KEY FIX: getIST7PMThreshold() returns the UTC equivalent of 19:00 IST
 * for the record's IST calendar day. This eliminates the 14.3h bug that
 * occurred when `new Date('YYYY-MM-DDT19:00:00')` was interpreted as
 * 19:00 UTC (= 00:30 IST next day) in UTC Docker containers.
 */
const enforceAutoLogout = async (record) => {
    if (!record || record.checkOut || !record.checkIn) return record;

    const now = new Date();
    const checkInDate = new Date(record.checkIn);

    // 7:00 PM IST expressed as UTC, for the IST day of the check-in
    const threshold7PMIST = getIST7PMThreshold(checkInDate);

    // IST day start for the record vs today
    const recordISTDayStart = getISTDayStart(checkInDate);
    const todayISTDayStart  = getISTDayStart(now);

    const isPastISTDay      = recordISTDayStart < todayISTDayStart;
    const isTodayPast7PM    = isSameISTDay(checkInDate, now) && now >= threshold7PMIST;

    if (isPastISTDay || isTodayPast7PM) {
        record.checkOut     = threshold7PMIST;
        const diffMs        = record.checkOut.getTime() - checkInDate.getTime();
        const hours         = parseFloat(Math.max(0, diffMs / (1000 * 60 * 60)).toFixed(1));
        record.workingHours = hours;

        // Half Day takes priority over Present / Late
        if (hours < 4) {
            record.status = 'Half Day';
        }

        // Persist only for Mongoose documents
        if (typeof record.save === 'function') {
            await record.save();
        }
    }

    return record;
};

module.exports = { enforceAutoLogout };
