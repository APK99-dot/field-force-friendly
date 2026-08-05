import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const activityIcon = new L.Icon({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Orange pin for individual GPS trail points
const gpsPointIcon = new L.Icon({
  iconUrl:
    "data:image/svg+xml;base64," +
    btoa(
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36"><path fill="#F59E0B" stroke="#ffffff" stroke-width="1.5" d="M12 1C6.5 1 2 5.5 2 11c0 7.5 10 23 10 23s10-15.5 10-23C22 5.5 17.5 1 12 1z"/><circle cx="12" cy="11" r="4" fill="#ffffff"/></svg>`
    ),
  iconSize: [24, 36],
  iconAnchor: [12, 36],
  popupAnchor: [0, -30],
});

const pinIcon = (fill: string) =>
  new L.Icon({
    iconUrl:
      "data:image/svg+xml;base64," +
      btoa(
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36"><path fill="${fill}" stroke="#ffffff" stroke-width="1.5" d="M12 1C6.5 1 2 5.5 2 11c0 7.5 10 23 10 23s10-15.5 10-23C22 5.5 17.5 1 12 1z"/><circle cx="12" cy="11" r="4" fill="#ffffff"/></svg>`
      ),
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -30],
  });

const startIcon = pinIcon("#16A34A"); // green — first fix of the day
const endIcon = pinIcon("#DC2626"); // red — latest fix

// The OSRM demo server caps waypoints per request and long URLs fail, so a full
// day of GPS fixes has to be thinned before asking for a route. First and last
// are always kept so the route still spans the whole day.
const MAX_ROUTE_WAYPOINTS = 40;

function thinPoints<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

interface GPSPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
}

interface ActivityMarker {
  lat: number;
  lng: number;
  name: string;
}

interface LeafletMapProps {
  location?: { lat: number; lng: number } | null;
  gpsPoints?: GPSPoint[];
  activityMarkers?: ActivityMarker[];
}

function MapAutoFit({ location, gpsPoints, activityMarkers }: LeafletMapProps) {
  const map = useMap();

  useEffect(() => {
    const bounds = L.latLngBounds([]);

    if (gpsPoints && gpsPoints.length > 0) {
      gpsPoints.forEach(p => bounds.extend([p.latitude, p.longitude]));
    }
    if (activityMarkers && activityMarkers.length > 0) {
      activityMarkers.forEach(m => bounds.extend([m.lat, m.lng]));
    }
    if (location && (!gpsPoints || gpsPoints.length === 0)) {
      bounds.extend([location.lat, location.lng]);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [map, location, gpsPoints, activityMarkers]);

  return null;
}

/**
 * Snaps the raw GPS trail to the road network via OSRM so the map shows the
 * route actually travelled rather than straight lines between fixes.
 *
 * Degrades quietly: if routing fails or is still in flight, the caller falls
 * back to the raw trail, so the map is never blank.
 */
function useRoadRoute(positions: [number, number][]) {
  const [route, setRoute] = useState<[number, number][] | null>(null);
  const [failed, setFailed] = useState(false);

  // Key on the thinned coordinates so we only refetch when the trail changes,
  // not on every render.
  const waypoints = useMemo(() => thinPoints(positions, MAX_ROUTE_WAYPOINTS), [positions]);
  const key = useMemo(() => waypoints.map(p => p.join(",")).join(";"), [waypoints]);

  useEffect(() => {
    if (waypoints.length < 2) {
      setRoute(null);
      setFailed(false);
      return;
    }

    const controller = new AbortController();
    setFailed(false);

    (async () => {
      try {
        // OSRM wants lon,lat — the opposite order to Leaflet.
        const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(";");
        const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`OSRM ${res.status}`);

        const data = await res.json();
        const line = data?.routes?.[0]?.geometry?.coordinates;
        if (!Array.isArray(line) || line.length < 2) throw new Error("no route geometry");

        setRoute(line.map(([lng, lat]: [number, number]) => [lat, lng]));
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        console.warn("Route snapping unavailable, showing raw GPS trail:", e);
        setRoute(null);
        setFailed(true);
      }
    })();

    return () => controller.abort();
  }, [key]);

  return { route, failed };
}

export default function LeafletMap({ location, gpsPoints, activityMarkers }: LeafletMapProps) {
  const polylinePositions: [number, number][] = useMemo(
    () => (gpsPoints || []).map(p => [p.latitude, p.longitude] as [number, number]),
    [gpsPoints]
  );
  const { route } = useRoadRoute(polylinePositions);

  const center: [number, number] = polylinePositions.length > 0
    ? polylinePositions[0]
    : location
      ? [location.lat, location.lng]
      : [22.5, 78.9];

  const zoom = polylinePositions.length > 0 || location ? 14 : 5;

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className="h-full w-full z-0"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://osm.org">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapAutoFit location={location} gpsPoints={gpsPoints} activityMarkers={activityMarkers} />
      {location && !gpsPoints?.length && (
        <Marker position={[location.lat, location.lng]}>
          <Popup>Current location</Popup>
        </Marker>
      )}
      {/* Road-snapped route when available; solid, since it is a real path.
          Falls back to the raw dashed trail so the map still shows something
          if routing is unavailable. */}
      {route && route.length > 1 ? (
        <Polyline positions={route} pathOptions={{ color: "#3B82F6", weight: 4, opacity: 0.85 }} />
      ) : (
        polylinePositions.length > 1 && (
          <Polyline
            positions={polylinePositions}
            pathOptions={{ color: "#3B82F6", weight: 3, dashArray: "6 8", opacity: 0.7 }}
          />
        )
      )}

      {/* Only the day's start and end are pinned — a marker per GPS fix made
          the map unreadable. Intermediate fixes are conveyed by the route. */}
      {polylinePositions.length > 0 && (
        <Marker position={polylinePositions[0]} icon={startIcon}>
          <Popup>
            Start
            {gpsPoints?.[0]?.timestamp
              ? ` · ${new Date(gpsPoints[0].timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </Popup>
        </Marker>
      )}
      {polylinePositions.length > 1 && (
        <Marker position={polylinePositions[polylinePositions.length - 1]} icon={endIcon}>
          <Popup>
            Latest
            {gpsPoints?.[gpsPoints.length - 1]?.timestamp
              ? ` · ${new Date(gpsPoints[gpsPoints.length - 1].timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </Popup>
        </Marker>
      )}

      {(activityMarkers || []).map((m, i) => (
        <Marker key={i} position={[m.lat, m.lng]} icon={activityIcon}>
          <Popup>{m.name}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
