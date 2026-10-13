export type Role = "rider" | "driver" | "admin";
export type VehicleType = "economy" | "comfort" | "xl";
export type PaymentMethod = "cash" | "card" | "wallet";
export type RideStatus = "searching" | "accepted" | "arrived" | "in_progress" | "completed" | "cancelled" | "no_drivers";

export interface Tokens { accessToken: string; refreshToken: string; tokenType: "Bearer"; expiresIn: number }
export interface User {
  id: string; email: string; phone: string | null; fullName: string; role: Role;
  rating: { average: number; count: number }; createdAt: string;
}
export interface Place { lat: number; lng: number; address?: string | null }

export interface DriverInfo {
  id: string; name: string; phone: string | null; rating: number;
  vehicle: { make: string; model: string; color: string; plate: string };
  location: { lat: number; lng: number; updatedAt: string } | null;
}
export interface RiderInfo { id: string; name: string; rating: number }
export interface Counterpart { name: string | null; vehicle?: { make: string; model: string; color: string; plate: string } | null }

export interface Ride {
  id: string; status: RideStatus; riderId: string; driverId: string | null; vehicleType: VehicleType;
  pickup: Place; dropoff: Place;
  estimate: { distanceKm: number; durationMin: number; fare: number };
  final: { distanceKm: number | null; fare: number; platformFee: number | null; driverEarnings: number | null } | null;
  currency: string; paymentMethod: PaymentMethod;
  cancellation: { by: string; reason: string | null } | null;
  ratings: { riderRating: number | null; driverRating: number | null };
  timestamps: { requestedAt: string; acceptedAt: string | null; arrivedAt: string | null; startedAt: string | null; completedAt: string | null; cancelledAt: string | null };
  driver?: DriverInfo | null; rider?: RiderInfo | null; counterpart?: Counterpart | null;
}
export interface Offer { offerId: string; expiresAt: string; distanceToPickupKm: number; ride: Ride }
export interface EstimateOption {
  vehicleType: VehicleType; fare: number; currency: string; distanceKm: number; durationMin: number;
  nearbyDrivers: number; pickupEtaMin: number | null;
}
export interface DriverProfile {
  status: "offline" | "online" | "busy"; licenseNumber: string;
  vehicle: { make: string; model: string; color: string; plate: string; type: VehicleType }; totalEarnings: number;
}
export interface Earnings { trips: number; gross: number; fees: number; net: number; currency: string; lifetimeEarnings: number }
export interface Payment { id: string; rideId: string; amount: number; currency: string; method: PaymentMethod; status: string; createdAt: string }
export interface RideEvent { id: number; type: string; actorId: string | null; data: Record<string, unknown>; createdAt: string }
export interface SessionInfo { sessionId: string; current: boolean; userAgent: string | null; ip: string | null; createdAt: string; lastUsedAt: string; expiresAt: string }
