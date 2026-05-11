'use strict';

/**
 * IST Timezone Utility
 * --------------------
 * All Date objects in JavaScript/MongoDB are UTC internally.
 * We must use UTC-epoch arithmetic to correctly compute IST-wall-clock
 * boundaries without installing extra packages.
 *
 * IST = UTC + 5:30 = UTC + 19800 seconds
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 19800000 ms

/**
 * Returns the UTC Date representing 00:00:00 IST for the IST calendar day
 * that contains the given UTC Date (defaults to now).
 *
 * Example: 2026-05-11T04:00:00Z  →  IST 09:30 → IST day 2026-05-11
 *          IST midnight = 2026-05-10T18:30:00Z
 */
const getISTDayStart = (utcDate = new Date()) => {
    const istEpochMs = utcDate.getTime() + IST_OFFSET_MS;
    const istMidnightMs = Math.floor(istEpochMs / 86400000) * 86400000;
    return new Date(istMidnightMs - IST_OFFSET_MS);
};

/**
 * Returns the UTC Date representing 23:59:59.999 IST for the same IST day.
 */
const getISTDayEnd = (utcDate = new Date()) => {
    const start = getISTDayStart(utcDate);
    return new Date(start.getTime() + 86400000 - 1);
};

/**
 * Returns the UTC Date representing 07:00 PM IST for the IST calendar day
 * that contains the given UTC Date.
 *
 * IST midnight (00:00 IST) is stored as getISTDayStart() (in UTC).
 * Adding 19 hours gives 19:00 IST = 13:30 UTC (for any IST day).
 */
const getIST7PMThreshold = (utcDate = new Date()) => {
    const start = getISTDayStart(utcDate);
    // 00:00 IST + 19 hours = 19:00 IST
    return new Date(start.getTime() + 19 * 60 * 60 * 1000);
};

/**
 * Returns the UTC Date representing 09:30 AM IST for the given UTC Date's IST day.
 */
const getIST930AM = (utcDate = new Date()) => {
    const start = getISTDayStart(utcDate);
    return new Date(start.getTime() + (9 * 60 + 30) * 60 * 1000);
};

/**
 * Returns the UTC Date representing 10:00 AM IST for the given UTC Date's IST day.
 */
const getIST10AM = (utcDate = new Date()) => {
    const start = getISTDayStart(utcDate);
    return new Date(start.getTime() + 10 * 60 * 60 * 1000);
};

/**
 * Returns the IST hour (0-23) for a given UTC Date.
 * Useful for logging / debugging.
 */
const getISTHour = (utcDate = new Date()) => {
    return new Date(utcDate.getTime() + IST_OFFSET_MS).getUTCHours();
};

/**
 * Returns the IST minutes (0-59) for a given UTC Date.
 */
const getISTMinutes = (utcDate = new Date()) => {
    return new Date(utcDate.getTime() + IST_OFFSET_MS).getUTCMinutes();
};

/**
 * Checks whether two UTC Dates fall on the same IST calendar day.
 */
const isSameISTDay = (utcDateA, utcDateB) => {
    return getISTDayStart(utcDateA).getTime() === getISTDayStart(utcDateB).getTime();
};

module.exports = {
    IST_OFFSET_MS,
    getISTDayStart,
    getISTDayEnd,
    getIST7PMThreshold,
    getIST930AM,
    getIST10AM,
    getISTHour,
    getISTMinutes,
    isSameISTDay,
};
