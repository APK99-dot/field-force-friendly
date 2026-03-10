

## Plan: Simplify GPS Track Page — Current Location Only

### What changes
Strip the GPS Tracking page down to show only the "Current Location" view. Remove the Tabs component, Day Tracking tab, and all related state/logic.

### File: `src/pages/GPSTracking.tsx`

**Remove:**
- Tabs wrapper (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`) — show current location content directly
- All Day Tracking state: `activeTab`, `trackingDate`, `selectedUser`, `teamMembers`, `gpsPoints`, `gpsStops`, `trackingLoading`, `currentUserId`
- All Day Tracking logic: `fetchTrackingData`, team members fetch, tracking data fetch effect
- Day Tracking computed values: `dateOptions`, `activityMarkers`, `totalDistance`, `firstPoint`, `lastPoint`
- The entire "tracking" `TabsContent` block (lines 252–388)
- Unused imports: `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger`, `useCallback`, `subDays`, `Clock`, `Navigation`, `supabase`, `useToast`
- Unused types: `TeamMember`, `GPSPoint`, `GPSStop`

**Keep:**
- Page header ("GPS Track")
- Current location geolocation logic (`location`, `locationError`, `retryLocation`)
- The date range selector card and map card (current location content)
- `LeafletMap` lazy import with Suspense
- Location error overlay with retry button

The result is a clean, single-view page showing only the user's current location on a map.

