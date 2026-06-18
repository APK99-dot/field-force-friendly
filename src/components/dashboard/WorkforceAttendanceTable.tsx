import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { WorkforceAttendanceRow } from "@/hooks/useWorkforceOverview";

interface Props {
  rows: WorkforceAttendanceRow[];
  isLoading: boolean;
}

export default function WorkforceAttendanceTable({ rows, isLoading }: Props) {
  return (
    <div className="rounded-md border">
      <div className="max-h-[420px] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead>Employee Name</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Check-In</TableHead>
              <TableHead>Check-Out</TableHead>
              <TableHead className="text-right">Active Hours</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No attendance records for this selection
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.full_name}</TableCell>
                  <TableCell>{format(new Date(r.date), "MMM d, yyyy")}</TableCell>
                  <TableCell>
                    {r.check_in_time ? format(new Date(r.check_in_time), "h:mm a") : "--"}
                  </TableCell>
                  <TableCell>
                    {r.check_out_time ? format(new Date(r.check_out_time), "h:mm a") : "--"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.active_hours != null ? `${r.active_hours.toFixed(1)}h` : "--"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
