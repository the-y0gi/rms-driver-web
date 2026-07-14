export interface Coordinates {
  lat: number;
  lng: number;
}

// Convert degrees to radians
const toRad = (value: number): number => {
  return (value * Math.PI) / 180;
};

// Convert radians to degrees
const toDeg = (value: number): number => {
  return (value * 180) / Math.PI;
};

/**
 * Calculates distance in meters between two GPS coordinates using the Haversine formula.
 */
export const getDistanceMeters = (pos1: Coordinates, pos2: Coordinates): number => {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(pos2.lat - pos1.lat);
  const dLng = toRad(pos2.lng - pos1.lng);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(pos1.lat)) *
      Math.cos(toRad(pos2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
      
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Calculates the bearing (angle in degrees, 0-360) from starting position to destination position.
 */
export const getBearing = (from: Coordinates, to: Coordinates): number => {
  const dLng = toRad(to.lng - from.lng);
  const fromLatRad = toRad(from.lat);
  const toLatRad = toRad(to.lat);

  const y = Math.sin(dLng) * Math.cos(toLatRad);
  const x =
    Math.cos(fromLatRad) * Math.sin(toLatRad) -
    Math.sin(fromLatRad) * Math.cos(toLatRad) * Math.cos(dLng);

  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
};
