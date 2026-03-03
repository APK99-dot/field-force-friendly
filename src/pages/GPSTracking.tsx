import { useState, useEffect, Suspense, lazy } from "react";
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

const LeafletMap = lazy(() =>
  import("@/components/LeafletMap").catch(() => {
    window.location.reload();
    return import("@/components/LeafletMap");
  })
);

type DateRange = "today" | "week" | "month";

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
              <p className="text-xs text-info">
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
