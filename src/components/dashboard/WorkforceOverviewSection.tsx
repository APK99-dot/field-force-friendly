import { useMemo, useState } from "react";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  format,
} from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";
import { useProfilePermissions } from "@/hooks/useProfilePermissions";
import {
  useWorkforceUsers,
  useWorkforceOverview,
} from "@/hooks/useWorkforceOverview";
import WorkforceFilters, { type DatePreset } from "./WorkforceFilters";
import WorkforceAttendanceTable from "./WorkforceAttendanceTable";
import WorkforceActivityCalendar from "./WorkforceActivityCalendar";

function resolveRange(preset: DatePreset, customStart: string, customEnd: string) {
  const now = new Date();
  if (preset === "this_week") {
    return { start: startOfWeek(now), end: endOfWeek(now) };
  }
  if (preset === "last_week") {
    const lw = subWeeks(now, 1);
    return { start: startOfWeek(lw), end: endOfWeek(lw) };
  }
  if (preset === "this_month") {
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }
  // custom
  const start = customStart ? new Date(customStart) : startOfMonth(now);
  const end = customEnd ? new Date(customEnd) : endOfMonth(now);
  return { start, end };
}

export default function WorkforceOverviewSection() {
  const { hasWidgetPermission, isLoading: permsLoading } = useProfilePermissions();
  const canView = hasWidgetPermission("widget_admin_attendance_overview");

  const [preset, setPreset] = useState<DatePreset>("this_week");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const { data: users = [] } = useWorkforceUsers();

  const range = useMemo(
    () => resolveRange(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );
  const startStr = format(range.start, "yyyy-MM-dd");
  const endStr = format(range.end, "yyyy-MM-dd");

  const { data, isLoading } = useWorkforceOverview({
    userIds: selectedUsers,
    start: startStr,
    end: endStr,
  });

  if (permsLoading || !canView) return null;

  const rangeLabel = `${format(range.start, "MMM d")} – ${format(range.end, "MMM d, yyyy")}`;

  return (
    <Card className="shadow-card">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <p className="text-sm font-bold">Attendance &amp; Workforce Overview</p>
        </div>

        <WorkforceFilters
          users={users}
          preset={preset}
          onPresetChange={setPreset}
          customStart={customStart}
          customEnd={customEnd}
          onCustomStartChange={setCustomStart}
          onCustomEndChange={setCustomEnd}
          selectedUsers={selectedUsers}
          onSelectedUsersChange={setSelectedUsers}
          rangeLabel={rangeLabel}
        />

        <WorkforceAttendanceTable rows={data?.attendanceRows || []} isLoading={isLoading} />

        <WorkforceActivityCalendar
          activities={data?.activityRows || []}
          anchorDate={range.start}
        />
      </CardContent>
    </Card>
  );
}
