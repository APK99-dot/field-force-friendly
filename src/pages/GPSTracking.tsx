import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { motion } from "framer-motion";
import { format, subDays } from "date-fns";
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
import { MapPin, AlertTriangle, RefreshCw, Clock, Navigation } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const LeafletMap = lazy(() =>
  import("@/components/LeafletMap").catch(() => {
    window.location.reload();
    return import("@/components/LeafletMap");
  })
);

type DateRange = "today" | "week" | "month";

interface TeamMember {
  id: string;
  full_name: string;
}

interface GPSPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
  speed: number | null;
  accuracy: number | null;
}

interface GPSStop {
  latitude: number;
  longitude: number;
  timestamp: string;
  duration_minutes: number | null;
  reason: string | null;
}

export default function GPSTracking() {
  const [activeTab, setActiveTab] = useState("current");
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState(false);

  // Day Tracking state
  const [trackingDate, setTrackingDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedUser, setSelectedUser] = useState<string>("me");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [gpsPoints, setGpsPoints] = useState<GPSPoint[]>([]);
  const [gpsStops, setGpsStops] = useState<GPSStop[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { toast } = useToast();

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  // Fetch team members (reportees)
  useEffect(() => {
    if (!currentUserId) return;
    const fetchTeam = async () => {
      const { data } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name");
      setTeamMembers((data || []).map((u: any) => ({ id: u.id, full_name: u.full_name || u.id })));
    };
    fetchTeam();
  }, [currentUserId]);

  // Get current location for Current Location tab
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocationError(false);
        },
        () => setLocationError(true),
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
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setLocationError(true),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  };

  // Fetch GPS tracking data for Day Tracking
  const fetchTrackingData = useCallback(async () => {
    if (!currentUserId) return;
    const userId = selectedUser === "me" ? currentUserId : selectedUser;
    setTrackingLoading(true);
    try {
      const [pointsRes, stopsRes] = await Promise.all([
        supabase
          .from("gps_tracking")
          .select("latitude, longitude, timestamp, speed, accuracy")
          .eq("user_id", userId)
          .eq("date", trackingDate)
          .order("timestamp", { ascending: true }),
        supabase
          .from("gps_tracking_stops")
          .select("latitude, longitude, timestamp, duration_minutes, reason")
          .eq("user_id", userId)
          .gte("timestamp", `${trackingDate}T00:00:00`)
          .lte("timestamp", `${trackingDate}T23:59:59`),
      ]);

      setGpsPoints(pointsRes.data || []);
      setGpsStops(stopsRes.data || []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setTrackingLoading(false);
    }
  }, [currentUserId, selectedUser, trackingDate, toast]);

  // Fetch tracking data when tab/date/user changes
  useEffect(() => {
    if (activeTab === "tracking") {
      fetchTrackingData();
    }
  }, [activeTab, fetchTrackingData]);

  const dateRangeLabels: Record<DateRange, string> = {
    today: "Today",
    week: "This Week",
    month: "This Month",
  };

  // Generate last 7 days for date picker
  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), i);
    return { value: format(d, "yyyy-MM-dd"), label: format(d, "EEE, MMM d") };
  });

  const activityMarkers = gpsStops.map((s) => ({
    lat: s.latitude,
    lng: s.longitude,
    name: s.reason || `Stop (${s.duration_minutes || 0} min)`,
  }));

  const totalDistance = gpsPoints.length > 1
    ? gpsPoints.reduce((acc, p, i) => {
        if (i === 0) return 0;
        const prev = gpsPoints[i - 1];
        const R = 6371;
        const dLat = ((p.latitude - prev.latitude) * Math.PI) / 180;
        const dLon = ((p.longitude - prev.longitude) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((prev.latitude * Math.PI) / 180) *
            Math.cos((p.latitude * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
        return acc + R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }, 0)
    : 0;

  const firstPoint = gpsPoints.length > 0 ? gpsPoints[0] : null;
  const lastPoint = gpsPoints.length > 0 ? gpsPoints[gpsPoints.length - 1] : null;

  return (
    <motion.div
      className="p-4 space-y-4 max-w-4xl mx-auto"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div>
        <h1 className="text-2xl font-bold">GPS Track</h1>
        <p className="text-sm text-muted-foreground">Monitor field movement with GPS tracking</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="current" className="flex-1">Current Location</TabsTrigger>
          <TabsTrigger value="tracking" className="flex-1">Day Tracking</TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="mt-4 space-y-4">
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
              <p className="text-xs text-muted-foreground">
                Showing: {format(new Date(), "MMMM do, yyyy")}
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card overflow-hidden">
            <CardContent className="p-0">
              <div className="h-[400px] relative">
                <Suspense fallback={
                  <div className="h-full w-full flex items-center justify-center bg-muted">
                    <p className="text-sm text-muted-foreground">Loading map...</p>
                  </div>
                }>
                  <LeafletMap location={location} />
                </Suspense>

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
          {/* Filters */}
          <Card className="shadow-card">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-medium">Select Date Range</p>
              <Select value={trackingDate} onValueChange={setTrackingDate}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dateOptions.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Showing: {format(new Date(trackingDate + "T00:00:00"), "MMMM do, yyyy")}
              </p>

              <p className="text-sm font-medium">Select Team Member</p>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">My Data</SelectItem>
                  {teamMembers
                    .filter((m) => m.id !== currentUserId)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Summary cards */}
          {gpsPoints.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <Card className="shadow-card">
                <CardContent className="p-3 text-center">
                  <Navigation className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-xs text-muted-foreground">Distance</p>
                  <p className="text-sm font-semibold">{totalDistance.toFixed(1)} km</p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="p-3 text-center">
                  <MapPin className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-xs text-muted-foreground">Points</p>
                  <p className="text-sm font-semibold">{gpsPoints.length}</p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="p-3 text-center">
                  <Clock className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-xs text-muted-foreground">Stops</p>
                  <p className="text-sm font-semibold">{gpsStops.length}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Timeline info */}
          {firstPoint && lastPoint && (
            <Card className="shadow-card">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <p className="text-muted-foreground">Start</p>
                    <p className="font-medium">{format(new Date(firstPoint.timestamp), "hh:mm a")}</p>
                  </div>
                  <div className="flex-1 mx-3 border-t border-dashed border-muted-foreground/30" />
                  <div className="text-right">
                    <p className="text-muted-foreground">Latest</p>
                    <p className="font-medium">{format(new Date(lastPoint.timestamp), "hh:mm a")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Map */}
          <Card className="shadow-card overflow-hidden">
            <CardContent className="p-0">
              <div className="h-[400px] relative">
                {trackingLoading ? (
                  <div className="h-full w-full flex items-center justify-center bg-muted">
                    <p className="text-sm text-muted-foreground">Loading tracking data...</p>
                  </div>
                ) : gpsPoints.length > 0 ? (
                  <Suspense fallback={
                    <div className="h-full w-full flex items-center justify-center bg-muted">
                      <p className="text-sm text-muted-foreground">Loading map...</p>
                    </div>
                  }>
                    <LeafletMap
                      gpsPoints={gpsPoints}
                      activityMarkers={activityMarkers}
                    />
                  </Suspense>
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center bg-muted/50">
                    <MapPin className="h-12 w-12 mb-3 text-muted-foreground/50" />
                    <p className="text-sm font-semibold text-muted-foreground">No tracking data</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      No GPS data found for this date
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Stops list */}
          {gpsStops.length > 0 && (
            <Card className="shadow-card">
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-medium">Stops</p>
                {gpsStops.map((stop, i) => (
                  <div key={i} className="flex items-start gap-3 text-xs border-b border-border pb-2 last:border-0 last:pb-0">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <MapPin className="h-3 w-3 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{stop.reason || "Stop"}</p>
                      <p className="text-muted-foreground">
                        {format(new Date(stop.timestamp), "hh:mm a")}
                        {stop.duration_minutes ? ` · ${stop.duration_minutes} min` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
