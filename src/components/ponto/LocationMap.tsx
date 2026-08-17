import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface LocationMapProps {
  latitude: number | null;
  longitude: number | null;
  radius: number;
  onPositionChange: (lat: number, lng: number) => void;
}

export function LocationMap({ latitude, longitude, radius, onPositionChange }: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: L.LatLngExpression =
      latitude && longitude ? [latitude, longitude] : [-15.7801, -47.9292];
    const zoom = latitude && longitude ? 17 : 4;

    const map = L.map(containerRef.current, {
      center,
      zoom,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      onPositionChange(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;

    // Ensure map renders correctly inside dialog
    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker, circle, and view when position/radius changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clean up old marker/circle
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }

    if (latitude !== null && longitude !== null) {
      markerRef.current = L.marker([latitude, longitude]).addTo(map);
      circleRef.current = L.circle([latitude, longitude], {
        radius,
        color: "hsl(213, 52%, 24%)",
        fillColor: "hsl(212, 60%, 45%)",
        fillOpacity: 0.2,
      }).addTo(map);
      map.setView([latitude, longitude], map.getZoom());
    }
  }, [latitude, longitude, radius]);

  return (
    <div
      ref={containerRef}
      className="rounded-md overflow-hidden border border-border"
      style={{ height: 280 }}
    />
  );
}
