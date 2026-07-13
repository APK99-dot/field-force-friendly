import { useEffect } from "react";
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

export default function LeafletMap({ location, gpsPoints, activityMarkers }: LeafletMapProps) {
  const polylinePositions: [number, number][] = (gpsPoints || []).map(p => [p.latitude, p.longitude]);

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
      {polylinePositions.length > 1 && (
        <Polyline positions={polylinePositions} pathOptions={{ color: "#3B82F6", weight: 4 }} />
      )}
      {(activityMarkers || []).map((m, i) => (
        <Marker key={i} position={[m.lat, m.lng]} icon={activityIcon}>
          <Popup>{m.name}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
