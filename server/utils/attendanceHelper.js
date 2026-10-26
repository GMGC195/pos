/**
 * Clamps break logs strictly within the [checkIn, checkOut] duty window.
 * - Any break starting at or after checkOut is dropped.
 * - Any break ending after checkOut is clamped to checkOut.
 * - Any break ending at or before checkIn is dropped.
 * - Any break starting before checkIn is clamped to checkIn.
 * - Recalculates duration_seconds for each remaining log and sums totalBreakSecs.
 */
function clampBreakLogsToDutyWindow(breakLogs, checkInTime, checkOutTime) {
  if (!Array.isArray(breakLogs) || breakLogs.length === 0) {
    return { breakLogs: [], totalBreakSecs: 0 };
  }
  const inMs = checkInTime ? new Date(checkInTime).getTime() : 0;
  const outMs = checkOutTime ? new Date(checkOutTime).getTime() : null;

  const validLogs = [];
  let totalSecs = 0;

  for (const b of breakLogs) {
    if (!b || !b.break_in) continue;
    let bInMs = new Date(b.break_in).getTime();
    let bOutMs = b.break_out ? new Date(b.break_out).getTime() : (outMs || Date.now());

    // Check bounds against checkOut
    if (outMs) {
      if (bInMs >= outMs) {
        continue; // Break began after session ended -> ignore completely
      }
      if (bOutMs > outMs) {
        bOutMs = outMs; // Break extended past session checkout -> clamp to checkout
      }
    }

    // Check bounds against checkIn
    if (inMs) {
      if (bOutMs <= inMs) {
        continue; // Break ended before session started -> ignore completely
      }
      if (bInMs < inMs) {
        bInMs = inMs; // Break started before session checkIn -> clamp to checkIn
      }
    }

    const duration = Math.max(0, Math.floor((bOutMs - bInMs) / 1000));
    if (duration > 0) {
      validLogs.push({
        ...b,
        break_in: new Date(bInMs).toISOString(),
        break_out: b.break_out ? new Date(bOutMs).toISOString() : (outMs ? new Date(outMs).toISOString() : null),
        duration_seconds: duration
      });
      totalSecs += duration;
    }
  }

  return { breakLogs: validLogs, totalBreakSecs: totalSecs };
}

module.exports = {
  clampBreakLogsToDutyWindow
};
