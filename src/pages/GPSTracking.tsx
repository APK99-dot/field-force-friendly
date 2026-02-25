import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPin, AlertTriangle, RefreshCw } from "lucide-react";
import "leaflet/dist/leaflet.css";

type DateRange = "today" | "week" | "month";

// Lazy-load leaflet to avoid cleanup issues
function LeafletMap({ location }: { location: { lat: number; lng: number } | null }) {
  const mapRef = useRef<any>(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const [modules, setModules] = useState<{
    MapContainer: any;
    TileLayer: any;
    Marker: any;
    Popup: any;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import("react-leaflet"),
      import("leaflet"),
    ]).then(([rl, L]) => {
      if (cancelled) return;
      delete (L.default.Icon.Default.prototype as any)._getIconUrl;
      L.default.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });
      setModules({
        MapContainer: rl.MapContainer,
        TileLayer: rl.TileLayer,
        Marker: rl.Marker,
        Popup: rl.Popup,
      });
      setLeafletReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return () => {
      // Clean up map instance on unmount
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  if (!leafletReady || !modules) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted">
        <p className="text-sm text-muted-foreground">Loading map...</p>
      </div>
    );
  }

  const { MapContainer, TileLayer, Marker, Popup } = modules;

  return (
    <MapContainer
      center={location ? [location.lat, location.lng] : [22.5, 78.9]}
      zoom={location ? 14 : 5}
      className="h-full w-full z-0"
      scrollWheelZoom
      ref={(map: any) => { mapRef.current = map; }}
    >
      <TileLayer
        attribution='&copy; <a href="https://osm.org">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {location && (
        <Marker position={[location.lat, location.lng]}>
          <Popup>Your current location</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}

export default function GPSTracking() {
  const [activeTab, setActiveTab] = useState("current");
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState(false);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocationError(false);
        },
        () => {
          setLocationError(true);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setLocationError(true);
    }
  }, []);

  const retryLocation = () => {
    setLocationError(false);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => setLocationError(true),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  };

  const dateRangeLabels: Record<DateRange, string> = {
    today: "Today",
    week: "This Week",
    month: "This Month",
  };

  return (
    <motion.div
      className="p-4 space-y-4 max-w-4xl mx-auto"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">GPS Track</h1>
        <p className="text-sm text-muted-foreground">Monitor field movement with GPS tracking</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="current" className="flex-1">Current Location</TabsTrigger>
          <TabsTrigger value="tracking" className="flex-1">Day Tracking</TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="mt-4 space-y-4">
          {/* Date Range Selector */}
          <Card className="shadow-card">
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-medium">Select Date Range</p>
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(dateRangeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-info">
                Showing: {format(new Date(), "MMMM do, yyyy")}
              </p>
            </CardContent>
          </Card>

          {/* Map */}
          <Card className="shadow-card overflow-hidden">
            <CardContent className="p-0">
              <div className="h-[400px] relative">
                <LeafletMap location={location} />

                {/* Location Error Overlay */}
                {locationError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-10">
                    <AlertTriangle className="h-10 w-10 text-accent mb-2" />
                    <p className="font-semibold text-sm">Location Unavailable</p>
                    <p className="text-xs text-muted-foreground text-center max-w-xs mt-1">
                      Location permission denied. Please enable location access in your device settings.
                    </p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={retryLocation}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Retry Location
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tracking" className="mt-4 space-y-4">
          <Card className="shadow-card">
            <CardContent className="p-8 text-center">
              <MapPin className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm font-semibold text-muted-foreground">No tracking data</p>
              <p className="text-xs text-muted-foreground mt-1">
                GPS tracking data will appear here once your day is started
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
