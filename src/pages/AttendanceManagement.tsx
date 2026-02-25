import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, X, User, Calendar, Users, ClipboardList, Settings, CalendarDays, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

import LiveAttendanceMonitoring from "@/components/LiveAttendanceMonitoring";
import HolidayManagement from "@/components/HolidayManagement";
import LeaveBalancesManager from "@/components/attendance/LeaveBalancesManager";
import LeaveTypesManager from "@/components/attendance/LeaveTypesManager";
import AttendancePolicyConfig from "@/components/attendance/AttendancePolicyConfig";
import WorkingDaysConfig from "@/components/attendance/WorkingDaysConfig";
import RejectionReasonDialog from "@/components/RejectionReasonDialog";

interface LeaveApplication {
  id: string;
  user_id: string;
  leave_type_id: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: string;
  applied_date: string;
  total_days: number;
  profiles?: { full_name: string; username: string };
  leave_types?: { name: string };
}

interface RegularizationRequest {
  id: string;
  user_id: string;
  attendance_date: string | null;
  date: string;
  current_check_in_time: string | null;
  current_check_out_time: string | null;
  requested_check_in_time: string | null;
  requested_check_out_time: string | null;
  reason: string;
  status: string;
  created_at: string;
  profiles?: { full_name: string; username: string };
}

const tabs = [
  { key: "live", label: "Live Attendance", icon: User },
  { key: "leave", label: "Leave Management", icon: Calendar },
  { key: "regularization", label: "Regularization", icon: Users },
  { key: "leave-balances", label: "Leave Balances", icon: ClipboardList },
  { key: "leave-types", label: "Leave Types", icon: FileText },
  { key: "holidays", label: "Holidays", icon: CalendarDays },
  { key: "working-days", label: "Working Days", icon: Calendar },
  { key: "policy", label: "Attendance Policy", icon: Settings },
];

export default function AttendanceManagement() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("live");
  const [leaveApplications, setLeaveApplications] = useState<LeaveApplication[]>([]);
  const [regularizationRequests, setRegularizationRequests] = useState<RegularizationRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState("all");
  const [allUsers, setAllUsers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [rejectionTarget, setRejectionTarget] = useState<{ type: "leave" | "reg"; id: string } | null>(null);

  useEffect(() => {
    if (activeTab === "leave") {
      fetchLeaveApplications();
      fetchUsers();
    } else if (activeTab === "regularization") {
      fetchRegularizationRequests();
      fetchUsers();
    }
  }, [activeTab, selectedUser]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.from("profiles").select("id, full_name").order("full_name");
      if (error) throw error;
      setAllUsers(data || []);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const fetchLeaveApplications = async () => {
    try {
      setIsLoading(true);
      let query = supabase.from("leave_applications").select("*");
      if (selectedUser !== "all") query = query.eq("user_id", selectedUser);
      const { data, error } = await query.order("applied_date", { ascending: false });
      if (error) throw error;

      const userIds = [...new Set(data?.map((app) => app.user_id) || [])];
      const leaveTypeIds = [...new Set(data?.map((app) => app.leave_type_id) || [])];

      const { data: profiles } = await supabase.from("profiles").select("id, full_name, username").in("id", userIds);
      const { data: leaveTypes } = await supabase.from("leave_types").select("id, name").in("id", leaveTypeIds);

      const enrichedData = data?.map((app) => ({
        ...app,
        profiles: profiles?.find((p) => p.id === app.user_id),
        leave_types: leaveTypes?.find((lt) => lt.id === app.leave_type_id),
      })) || [];

      setLeaveApplications(enrichedData);
    } catch (error) {
      console.error("Error fetching leave applications:", error);
      toast.error("Failed to fetch leave applications");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRegularizationRequests = async () => {
    try {
      setIsLoading(true);
      let query = supabase.from("regularization_requests").select("*").eq("status", "pending");
      if (selectedUser !== "all") query = query.eq("user_id", selectedUser);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;

      const userIds = [...new Set(data?.map((req) => req.user_id) || [])];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, username").in("id", userIds);

      const enrichedData = data?.map((req) => ({
        ...req,
        profiles: profiles?.find((p) => p.id === req.user_id),
      })) || [];

      setRegularizationRequests(enrichedData);
    } catch (error) {
      console.error("Error fetching regularization requests:", error);
      toast.error("Failed to fetch regularization requests");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeaveStatusUpdate = async (applicationId: string, newStatus: string) => {
    try {
      const updateData: any = {
        status: newStatus,
        approved_date: newStatus === "approved" ? new Date().toISOString() : null,
      };
      const { data: { user } } = await supabase.auth.getUser();
      if (user) updateData.approved_by = user.id;

      const { error } = await supabase.from("leave_applications").update(updateData).eq("id", applicationId);
      if (error) throw error;

      toast.success(`Leave application ${newStatus} successfully`);
      fetchLeaveApplications();
    } catch (error) {
      console.error("Error updating leave application:", error);
      toast.error("Failed to update leave application");
    }
  };

  const handleRegularizationStatusUpdate = async (requestId: string, newStatus: string, rejectionReason?: string) => {
    try {
      const { data: request, error: fetchError } = await supabase
        .from("regularization_requests")
        .select("*")
        .eq("id", requestId)
        .single();
      if (fetchError) throw fetchError;

      const { data: { user } } = await supabase.auth.getUser();

      if (newStatus === "approved" && request) {
        let totalHours = null;
        if (request.requested_check_in_time && request.requested_check_out_time) {
          const checkIn = new Date(request.requested_check_in_time);
          const checkOut = new Date(request.requested_check_out_time);
          totalHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
        }

        const { error: attendanceError } = await supabase.from("attendance").upsert(
          {
            user_id: request.user_id,
            date: request.attendance_date || request.date,
            check_in_time: request.requested_check_in_time,
            check_out_time: request.requested_check_out_time,
            status: "regularized",
            total_hours: totalHours,
            notes: `Regularized via request #${requestId.slice(0, 8)}`,
            regularized_request_id: requestId,
          },
          { onConflict: "user_id,date" }
        );
        if (attendanceError) {
          console.error("Error updating attendance:", attendanceError);
          throw attendanceError;
        }
      }

      const updateData: any = {
        status: newStatus,
        approved_at: newStatus === "approved" ? new Date().toISOString() : null,
        rejection_reason: rejectionReason || null,
      };
      if (user) updateData.approved_by = user.id;

      const { error } = await supabase.from("regularization_requests").update(updateData).eq("id", requestId);
      if (error) throw error;

      toast.success(`Regularization request ${newStatus} successfully`);
      fetchRegularizationRequests();
    } catch (error) {
      console.error("Error updating regularization request:", error);
      toast.error("Failed to update regularization request");
    }
  };

  const handleRejectClick = (type: "leave" | "reg", id: string) => {
    setRejectionTarget({ type, id });
    setShowRejectionDialog(true);
  };

  const handleConfirmRejection = async (reason: string) => {
    if (!rejectionTarget) return;
    if (rejectionTarget.type === "leave") {
      await handleLeaveStatusUpdate(rejectionTarget.id, "rejected");
    } else {
      await handleRegularizationStatusUpdate(rejectionTarget.id, "rejected", reason);
    }
    setRejectionTarget(null);
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { cls: string; label: string }> = {
      pending: { cls: "bg-yellow-100 text-yellow-800", label: "Pending" },
      approved: { cls: "bg-green-100 text-green-800", label: "Approved" },
      rejected: { cls: "bg-red-100 text-red-800", label: "Rejected" },
    };
    const c = config[status] || { cls: "bg-muted text-muted-foreground", label: status };
    return <Badge className={c.cls}>{c.label}</Badge>;
  };

  const formatTime = (t: string | null) => (t ? format(new Date(t), "HH:mm") : "--");

  return (
    <motion.div className="p-4 space-y-6 max-w-6xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin-controls")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Attendance Management</h1>
          <p className="text-muted-foreground">Monitor attendance, manage leaves, configure policies and holidays</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 border-b pb-2 min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`py-2 px-3 rounded-t-lg transition-colors flex items-center text-sm font-medium whitespace-nowrap ${
                  activeTab === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <Icon className="w-4 h-4 mr-1.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "live" && <LiveAttendanceMonitoring />}

      {activeTab === "leave" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Leave Applications Management</CardTitle>
                <CardDescription>Review and manage employee leave requests</CardDescription>
              </div>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {allUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : leaveApplications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No leave applications found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Leave Type</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Applied Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaveApplications.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">{app.profiles?.full_name || "Unknown User"}</TableCell>
                      <TableCell>{app.leave_types?.name || "Unknown"}</TableCell>
                      <TableCell>{format(new Date(app.from_date), "MMM dd, yyyy")}</TableCell>
                      <TableCell>{format(new Date(app.to_date), "MMM dd, yyyy")}</TableCell>
                      <TableCell><div className="max-w-xs truncate">{app.reason}</div></TableCell>
                      <TableCell>{app.applied_date ? format(new Date(app.applied_date), "MMM dd, yyyy") : "--"}</TableCell>
                      <TableCell>{getStatusBadge(app.status)}</TableCell>
                      <TableCell>
                        {app.status === "pending" && (
                          <div className="flex space-x-2">
                            <Button size="sm" onClick={() => handleLeaveStatusUpdate(app.id, "approved")} className="bg-green-600 hover:bg-green-700">
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleRejectClick("leave", app.id)}>
                              <X className="h-4 w-4" />
                            </Button>
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
      )}

      {activeTab === "regularization" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Pending Regularization Requests</CardTitle>
                <CardDescription>Review and approve attendance regularization requests</CardDescription>
              </div>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {allUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : regularizationRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No pending regularization requests found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Current In/Out</TableHead>
                    <TableHead>Requested In/Out</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Requested On</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {regularizationRequests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{req.profiles?.full_name || "Unknown User"}</TableCell>
                      <TableCell>{format(new Date(req.attendance_date || req.date), "MMM dd, yyyy")}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>In: {formatTime(req.current_check_in_time)}</div>
                          <div>Out: {formatTime(req.current_check_out_time)}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>In: {formatTime(req.requested_check_in_time)}</div>
                          <div>Out: {formatTime(req.requested_check_out_time)}</div>
                        </div>
                      </TableCell>
                      <TableCell><div className="max-w-xs truncate">{req.reason}</div></TableCell>
                      <TableCell>{format(new Date(req.created_at), "MMM dd, yyyy")}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button size="sm" onClick={() => handleRegularizationStatusUpdate(req.id, "approved")} className="bg-green-600 hover:bg-green-700">
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleRejectClick("reg", req.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "leave-balances" && <LeaveBalancesManager />}
      {activeTab === "leave-types" && <LeaveTypesManager />}
      {activeTab === "holidays" && <HolidayManagement />}
      {activeTab === "working-days" && <WorkingDaysConfig />}
      {activeTab === "policy" && <AttendancePolicyConfig />}

      <RejectionReasonDialog
        isOpen={showRejectionDialog}
        onClose={() => setShowRejectionDialog(false)}
        onConfirm={handleConfirmRejection}
        title={rejectionTarget?.type === "leave" ? "Reject Leave Application" : "Reject Regularization Request"}
      />
    </motion.div>
  );
}
