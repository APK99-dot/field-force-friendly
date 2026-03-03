import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
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
      {location && !gpsPoints?.length && (
        <Marker position={[location.lat, location.lng]}>
          <Popup>Your current location</Popup>
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
