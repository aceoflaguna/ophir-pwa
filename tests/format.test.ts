import { describe, expect, it, vi } from "vitest";
import { dayLabel, duration, haversineKm, isLive, km, money } from "../src/util/format";

describe("format helpers", () => {
  it("formats money", () => {
    expect(money(12.5)).toBe("$12.50");
    expect(money(12.5, "PHP")).toBe("12.50 PHP");
    expect(money(null)).toBe("—");
  });

  it("formats durations", () => {
    const t = new Date("2025-01-01T10:00:00Z");
    expect(duration(t, new Date(+t + 42_000))).toBe("42s");
    expect(duration(t, new Date(+t + 125_000))).toBe("2m 5s");
    expect(duration(t, new Date(+t + 3_900_000))).toBe("1h 5m");
    expect(duration(+t + 5000, t)).toBe("0s"); // never negative
  });

  it("formats distances", () => {
    expect(km(0.42)).toBe("420 m");
    expect(km(3.14159)).toBe("3.1 km");
  });

  it("computes haversine distance", () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
    // 1 degree of latitude is ~111.2 km
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1);
  });

  it("labels days relative to today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15, 12, 0, 0));
    expect(dayLabel(new Date(2025, 5, 15, 8, 0, 0))).toBe("Today");
    expect(dayLabel(new Date(2025, 5, 14, 23, 0, 0))).toBe("Yesterday");
    expect(dayLabel(new Date(2025, 5, 1, 9, 0, 0))).not.toMatch(/Today|Yesterday/);
    vi.useRealTimers();
  });

  it("knows which statuses are live", () => {
    expect(isLive("searching")).toBe(true);
    expect(isLive("in_progress")).toBe(true);
    expect(isLive("completed")).toBe(false);
    expect(isLive("no_drivers")).toBe(false);
  });
});
