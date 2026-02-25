import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";

import LiveAttendanceMonitoring from "@/components/LiveAttendanceMonitoring";
import HolidayManagement from "@/components/HolidayManagement";
import LeaveBalancesManager from "@/components/attendance/LeaveBalancesManager";
import LeaveTypesManager from "@/components/attendance/LeaveTypesManager";
import AttendancePolicyConfig from "@/components/attendance/AttendancePolicyConfig";
import WorkingDaysConfig from "@/components/attendance/WorkingDaysConfig";
import RejectionReasonDialog from "@/components/RejectionReasonDialog";

export default function AttendanceManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [rejectionDialog, setRejectionDialog] = useState<{ open: boolean; type: "leave" | "reg"; id: string }>({ open: false, type: "leave", id: "" });

  // Leave applications query
  const leaveQuery = useQuery({
    queryKey: ["admin-leave-applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_applications")
        .select("*, profiles:user_id(full_name, username), leave_types!leave_applications_leave_type_id_fkey(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []).map((item: any) => ({
        ...item,
        leave_types: Array.isArray(item.leave_types) ? (item.leave_types.length > 0 ? item.leave_types[0] : null) : item.leave_types,
      }));
    },
  });

  // Regularization requests query
  const regQuery = useQuery({
    queryKey: ["admin-regularization-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regularization_requests")
        .select("*, profiles:user_id(full_name, username)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const handleLeaveAction = async (id: string, action: "approved" | "rejected", rejectionReason?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const updateData: any = { status: action, approved_by: user?.id, approved_at: new Date().toISOString() };
    if (action === "approved") updateData.approved_date = new Date().toISOString();
    const { error } = await supabase.from("leave_applications").update(updateData).eq("id", id);
    if (error) { toast.error("Failed to update leave application"); return; }
    toast.success(`Leave application ${action}`);
    queryClient.invalidateQueries({ queryKey: ["admin-leave-applications"] });
  };

  const handleRegAction = async (id: string, action: "approved" | "rejected", rejectionReason?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const updateData: any = { status: action, approved_by: user?.id, approved_at: new Date().toISOString() };
    if (rejectionReason) updateData.rejection_reason = rejectionReason;

    const { error } = await supabase.from("regularization_requests").update(updateData).eq("id", id);
    if (error) { toast.error("Failed to update regularization request"); return; }

    // If approved, update the attendance record
    if (action === "approved") {
      const request = (regQuery.data || []).find((r: any) => r.id === id);
      if (request) {
        const attendanceDate = request.attendance_date || request.date;
        const { data: existing } = await supabase.from("attendance").select("id").eq("user_id", request.user_id).eq("date", attendanceDate).maybeSingle();
        if (existing) {
          await supabase.from("attendance").update({
            check_in_time: request.requested_check_in_time || undefined,
            check_out_time: request.requested_check_out_time || undefined,
            status: "regularized",
            regularized_request_id: id,
          }).eq("id", existing.id);
        } else {
          await supabase.from("attendance").insert({
            user_id: request.user_id,
            date: attendanceDate,
            check_in_time: request.requested_check_in_time,
            check_out_time: request.requested_check_out_time,
            status: "regularized",
            regularized_request_id: id,
          });
        }
      }
    }

    toast.success(`Regularization request ${action}`);
    queryClient.invalidateQueries({ queryKey: ["admin-regularization-requests"] });
  };

  const handleRejectionConfirm = async (reason: string) => {
    if (rejectionDialog.type === "leave") await handleLeaveAction(rejectionDialog.id, "rejected", reason);
    else await handleRegAction(rejectionDialog.id, "rejected", reason);
    setRejectionDialog({ open: false, type: "leave", id: "" });
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: "bg-warning/20 text-warning",
      approved: "bg-success/20 text-success",
      rejected: "bg-destructive/20 text-destructive",
    };
    return <Badge className={map[status] || "bg-muted text-muted-foreground"}>{status}</Badge>;
  };

  const formatTime = (t: string | null) => t ? format(new Date(t), "HH:mm") : "--";

  return (
    <motion.div className="p-4 space-y-4 max-w-6xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin-controls")}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="text-2xl font-bold">Attendance Management</h1>
          <p className="text-sm text-muted-foreground">Manage team attendance, leave, and policies</p>
        </div>
      </div>

      <Tabs defaultValue="monitoring" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="monitoring" className="text-xs">Live Monitoring</TabsTrigger>
          <TabsTrigger value="leave-mgmt" className="text-xs">Leave Management</TabsTrigger>
          <TabsTrigger value="regularization" className="text-xs">Regularization</TabsTrigger>
          <TabsTrigger value="leave-balances" className="text-xs">Leave Balances</TabsTrigger>
          <TabsTrigger value="leave-types" className="text-xs">Leave Types</TabsTrigger>
          <TabsTrigger value="holidays" className="text-xs">Holidays</TabsTrigger>
          <TabsTrigger value="working-days" className="text-xs">Working Days</TabsTrigger>
          <TabsTrigger value="policy" className="text-xs">Policy</TabsTrigger>
        </TabsList>

        <TabsContent value="monitoring" className="mt-4">
          <LiveAttendanceMonitoring />
        </TabsContent>

        <TabsContent value="leave-mgmt" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Leave Applications</CardTitle></CardHeader>
            <CardContent>
              {leaveQuery.isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (leaveQuery.data || []).length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No leave applications</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(leaveQuery.data || []).map((leave: any) => (
                      <TableRow key={leave.id}>
                        <TableCell className="font-medium">{leave.profiles?.full_name || leave.profiles?.username || "—"}</TableCell>
                        <TableCell>{leave.leave_types?.name || "—"}</TableCell>
                        <TableCell>{leave.from_date}</TableCell>
                        <TableCell>{leave.to_date}</TableCell>
                        <TableCell>{leave.total_days}</TableCell>
                        <TableCell>{getStatusBadge(leave.status)}</TableCell>
                        <TableCell>
                          {leave.status === "pending" && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-success" onClick={() => handleLeaveAction(leave.id, "approved")}><Check className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => setRejectionDialog({ open: true, type: "leave", id: leave.id })}><X className="h-4 w-4" /></Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regularization" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Regularization Requests</CardTitle></CardHeader>
            <CardContent>
              {regQuery.isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (regQuery.data || []).length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No regularization requests</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Current In</TableHead>
                      <TableHead>Current Out</TableHead>
                      <TableHead>Requested In</TableHead>
                      <TableHead>Requested Out</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(regQuery.data || []).map((req: any) => (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">{req.profiles?.full_name || req.profiles?.username || "—"}</TableCell>
                        <TableCell>{req.attendance_date || req.date}</TableCell>
                        <TableCell>{formatTime(req.current_check_in_time)}</TableCell>
                        <TableCell>{formatTime(req.current_check_out_time)}</TableCell>
                        <TableCell className="text-success font-medium">{formatTime(req.requested_check_in_time)}</TableCell>
                        <TableCell className="text-success font-medium">{formatTime(req.requested_check_out_time)}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{req.reason || "—"}</TableCell>
                        <TableCell>{getStatusBadge(req.status)}</TableCell>
                        <TableCell>
                          {req.status === "pending" && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-success" onClick={() => handleRegAction(req.id, "approved")}><Check className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => setRejectionDialog({ open: true, type: "reg", id: req.id })}><X className="h-4 w-4" /></Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leave-balances" className="mt-4"><LeaveBalancesManager /></TabsContent>
        <TabsContent value="leave-types" className="mt-4"><LeaveTypesManager /></TabsContent>
        <TabsContent value="holidays" className="mt-4"><HolidayManagement /></TabsContent>
        <TabsContent value="working-days" className="mt-4"><WorkingDaysConfig /></TabsContent>
        <TabsContent value="policy" className="mt-4"><AttendancePolicyConfig /></TabsContent>
      </Tabs>

      <RejectionReasonDialog
        isOpen={rejectionDialog.open}
        onClose={() => setRejectionDialog({ open: false, type: "leave", id: "" })}
        onConfirm={handleRejectionConfirm}
        title={rejectionDialog.type === "leave" ? "Reject Leave Application" : "Reject Regularization Request"}
      />
    </motion.div>
  );
}
