'use strict';

/**
 * autoLogoutJob.js
 * ─────────────────
 * Background sweep that finds attendance records with checkIn but no checkOut
 * where the IST time is >= 7:00 PM, and auto-checks them out.
 *
 * Called by server.js via setInterval every 5 minutes.
 * Uses the same IST logic as attendanceHelper.js to stay consistent.
 */

const Attendance = require('../models/Attendance');
const { getISTDayStart, getIST7PMThreshold } = require('./istTime');

const runAutoLogoutSweep = async () => {
    const now = new Date();
    const threshold7PMIST = getIST7PMThreshold(now);

    // Only run the sweep if current UTC time is past 7 PM IST for today
    if (now < threshold7PMIST) {
        return 0;
    }

    // Find records that:
    // 1. Have checkIn set
    // 2. Have no checkOut
    // 3. date is within today's IST day (or earlier, to catch missed past records)
    const todayISTStart = getISTDayStart(now);

    const openRecords = await Attendance.find({
        checkIn:  { $exists: true, $ne: null },
        checkOut: { $in: [null, undefined] },
        date:     { $lte: new Date(threshold7PMIST.getTime() + 1) } // up to and including 7PM boundary
    });

    let count = 0;

    for (const record of openRecords) {
        try {
            const checkInDate      = new Date(record.checkIn);
            const recordISTDayStart = getISTDayStart(checkInDate);
            // Threshold is 7 PM IST of the record's IST day (returned as UTC equivalent)
            const recordThreshold  = getIST7PMThreshold(checkInDate);

            // Only auto-logout if we have passed the 7 PM IST mark for that day
            if (now < recordThreshold) continue;

            // ── STORAGE RULE: Store UTC ───────────────────────────────────────────
            // We store the 7:00 PM IST mark as its UTC equivalent Date object.
            record.checkOut     = recordThreshold;
            
            // ── CALCULATION RULE: Use Raw UTC getTime() ───────────────────────────
            // ALWAYS use raw UTC timestamps for duration. NEVER parse locale strings.
            const diffMs        = recordThreshold.getTime() - checkInDate.getTime();
            const hours         = parseFloat(Math.max(0, diffMs / (1000 * 60 * 60)).toFixed(1));
            record.workingHours = hours;

            // ── STATUS RULE: Half Day overrides Late/Present ──────────────────────
            if (hours < 4) {
                record.status = 'Half Day';
            }
            // else: keep status from check-in (Present or Late)

            console.log(`DEBUG [AutoLogoutJob] recordId=${record._id} hours=${hours} status=${record.status}`);

            await record.save();
            count++;
        } catch (err) {
            console.error(`[AutoLogout] Failed to process record ${record._id}:`, err.message);
        }
    }

    return count;
};

module.exports = { runAutoLogoutSweep };
