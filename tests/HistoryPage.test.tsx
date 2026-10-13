import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ride } from "../src/api/types";

vi.mock("../src/components/MapView", () => ({ default: () => <div data-testid="map" /> }));

const api = vi.hoisted(() => ({
  rides: vi.fn(), rideStats: vi.fn(), ride: vi.fn(), rideEvents: vi.fn(), rateRide: vi.fn(),
}));
vi.mock("../src/api/client", () => ({ api, errorText: (e: unknown) => (e as Error).message }));

import HistoryPage from "../src/pages/HistoryPage";
import { ToastProvider } from "../src/state/toast";

const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();
function mk(i: number, over: Partial<Ride> & { counterpart?: unknown } = {}): Ride {
  return {
    id: `ride-${i}`, status: "completed", riderId: "r", driverId: "d", vehicleType: "economy",
    pickup: { lat: 14.55, lng: 121.02, address: `Pickup ${i}` }, dropoff: { lat: 14.56, lng: 121.03, address: `Dropoff ${i}` },
    estimate: { distanceKm: 3, durationMin: 9, fare: 5 },
    final: { distanceKm: 3.2, fare: 6.5, platformFee: 1.3, driverEarnings: 5.2 },
    currency: "USD", paymentMethod: "cash", cancellation: null, ratings: { riderRating: 5, driverRating: null },
    timestamps: { requestedAt: iso(10 + i), acceptedAt: iso(9), arrivedAt: iso(8), startedAt: iso(7), completedAt: iso(2), cancelledAt: null },
    counterpart: { name: "Dana Driver", vehicle: { make: "Toyota", model: "Vios", color: "White", plate: "ABC123" } },
    ...over,
  } as Ride;
}
const stats = { completed: 3, cancelled: 1, noDrivers: 1, totalFare: 19.5, totalEarnings: 15.6, totalKm: 9.6, currency: "USD" };

function renderPage(role: "rider" | "driver" = "rider") {
  return render(<ToastProvider><HistoryPage role={role} active /></ToastProvider>);
}

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  api.rideStats.mockResolvedValue(stats);
  api.rides.mockResolvedValue({ rides: [], limit: 15, offset: 0 });
});

describe("HistoryPage", () => {
  it("shows an empty state tailored to the role", async () => {
    renderPage("driver");
    expect(await screen.findByText(/Go online and accept your first ride/i)).toBeInTheDocument();
  });

  it("lists rides with route, counterpart and fare for riders", async () => {
    api.rides.mockResolvedValue({ rides: [mk(1)], limit: 15, offset: 0 });
    renderPage("rider");
    expect(await screen.findByText("Pickup 1")).toBeInTheDocument();
    expect(screen.getByText("Dropoff 1")).toBeInTheDocument();
    expect(screen.getByText(/Dana Driver · ABC123/)).toBeInTheDocument();
    expect(screen.getByText("$6.50")).toBeInTheDocument(); // rider sees what they paid
    expect(screen.getByText("Spent")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("$19.50")).toBeInTheDocument());
  });

  it("shows earnings rather than fare for drivers", async () => {
    api.rides.mockResolvedValue({ rides: [mk(1, { counterpart: { name: "Rita Rider" } })], limit: 15, offset: 0 });
    renderPage("driver");
    expect(await screen.findByText("$5.20")).toBeInTheDocument();
    expect(screen.getByText(/Rita Rider/)).toBeInTheDocument();
    expect(screen.getByText("Earned")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("$15.60")).toBeInTheDocument());
  });

  it("shows the estimate for rides that did not complete", async () => {
    api.rides.mockResolvedValue({ rides: [mk(1, { status: "cancelled", final: null, counterpart: null })], limit: 15, offset: 0 });
    renderPage();
    expect(await screen.findByText(/\$5\.00 est\./)).toBeInTheDocument();
  });

  it("re-queries with the status when a filter is chosen", async () => {
    renderPage();
    await waitFor(() => expect(api.rides).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("tab", { name: "Cancelled" }));
    await waitFor(() => expect(api.rides).toHaveBeenLastCalledWith({ status: "cancelled", limit: 15, offset: 0 }));
    expect(screen.getByRole("tab", { name: "Cancelled" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Nothing matches this filter.")).toBeInTheDocument();
  });

  it("loads more pages and appends them", async () => {
    const page1 = Array.from({ length: 15 }, (_, i) => mk(i));
    api.rides.mockResolvedValueOnce({ rides: page1, limit: 15, offset: 0 });
    api.rides.mockResolvedValueOnce({ rides: [mk(99)], limit: 15, offset: 15 });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Pickup 99")).toBeInTheDocument();
    expect(api.rides).toHaveBeenLastCalledWith({ status: undefined, limit: 15, offset: 15 });
    expect(screen.getByText("Pickup 0")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument(); // short page = end
  });

  it("surfaces load errors and can retry", async () => {
    api.rides.mockRejectedValueOnce(new Error("Cannot reach the server"));
    renderPage();
    expect(await screen.findByText("Cannot reach the server")).toBeInTheDocument();
    api.rides.mockResolvedValueOnce({ rides: [mk(1)], limit: 15, offset: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Pickup 1")).toBeInTheDocument();
  });

  it("opens a receipt with the timeline and lets a rider rate once", async () => {
    const ride = mk(1, { ratings: { riderRating: null, driverRating: null }, driver: { id: "d", name: "Dana Driver", phone: null, rating: 4.9, vehicle: { make: "Toyota", model: "Vios", color: "White", plate: "ABC123" }, location: null } });
    api.rides.mockResolvedValue({ rides: [ride], limit: 15, offset: 0 });
    api.ride.mockResolvedValue({ ride });
    api.rideEvents.mockResolvedValue({ events: [
      { id: 1, type: "requested", actorId: null, data: {}, createdAt: iso(10) },
      { id: 2, type: "completed", actorId: null, data: {}, createdAt: iso(2) },
    ] });
    api.rateRide.mockResolvedValue(undefined);
    renderPage("rider");
    fireEvent.click(await screen.findByRole("button", { name: /Trip on/ }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Ride requested")).toBeInTheDocument();
    expect(within(dialog).getByText("Trip completed")).toBeInTheDocument();
    expect(within(dialog).getByText(/Dana Driver · White Toyota Vios · ABC123/)).toBeInTheDocument();

    const rateBtn = within(dialog).getByRole("button", { name: "Rate driver" });
    expect(rateBtn).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("radio", { name: "4 stars" }));
    fireEvent.click(rateBtn);
    await waitFor(() => expect(api.rateRide).toHaveBeenCalledWith("ride-1", 4));
    await waitFor(() => expect(within(dialog).queryByRole("button", { name: "Rate driver" })).not.toBeInTheDocument());
  });

  it("closes the receipt with Escape", async () => {
    const ride = mk(1);
    api.rides.mockResolvedValue({ rides: [ride], limit: 15, offset: 0 });
    api.ride.mockResolvedValue({ ride });
    api.rideEvents.mockResolvedValue({ events: [] });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Trip on/ }));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
