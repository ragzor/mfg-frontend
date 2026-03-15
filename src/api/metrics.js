import { api } from "./client";

// ─────────────────────────────────────────────
// GET /metrics/part-delays
// Returns per-part max process delay:
// [{ part_number, part_name, max_process_delay_days }]
// ─────────────────────────────────────────────

export function getPartDelays() {
  return api.get("/metrics/part-delays");
}

// ─────────────────────────────────────────────
// GET /metrics/bottlenecks
// Analyses completed processes for delays.
// Returns sorted by average_delay desc:
// [{
//   process_name,
//   average_delay,
//   max_delay,
//   total_completed,
//   delayed_count,
//   on_time_percentage
// }]
// ─────────────────────────────────────────────

export function getBottlenecks() {
  return api.get("/metrics/bottlenecks");
}

// ─────────────────────────────────────────────
// GET /metrics/schedule-variance
// Returns original vs forecast target date per part:
// [{
//   part_number,
//   original_target_date,
//   forecast_target_date,
//   variance_days          ← positive = behind schedule
// }]
// ─────────────────────────────────────────────

export function getScheduleVariance() {
  return api.get("/metrics/schedule-variance");
}
