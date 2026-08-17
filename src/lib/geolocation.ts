/**
 * Haversine formula to calculate the distance between two points on Earth.
 * Returns the distance in meters.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Gets the current position from the browser's Geolocation API.
 * Returns a promise with { latitude, longitude }.
 */
export function getCurrentPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalização não é suportada pelo navegador."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error("Permissão de geolocalização negada. Ative nas configurações do navegador."));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error("Posição indisponível. Verifique seu GPS."));
            break;
          case error.TIMEOUT:
            reject(new Error("Tempo esgotado ao obter localização."));
            break;
          default:
            reject(new Error("Erro ao obter localização."));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
}

export interface NearestLocationResult {
  locationId: string;
  locationName: string;
  distance: number;
  withinRadius: boolean;
}

export interface ClockLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

/**
 * Finds the nearest location from a list and checks if within radius.
 */
export function findNearestLocation(
  userLat: number,
  userLon: number,
  locations: ClockLocation[]
): NearestLocationResult | null {
  if (locations.length === 0) return null;

  let nearest: NearestLocationResult | null = null;

  for (const loc of locations) {
    const dist = haversineDistance(userLat, userLon, loc.latitude, loc.longitude);
    if (!nearest || dist < nearest.distance) {
      nearest = {
        locationId: loc.id,
        locationName: loc.name,
        distance: Math.round(dist),
        withinRadius: dist <= loc.radius_meters,
      };
    }
  }

  return nearest;
}
