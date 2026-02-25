import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export default function AttendanceManagement() {
  const navigate = useNavigate();

  const attendanceQuery = useQuery({
    queryKey: ["admin-attendance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("*, profiles:user_id(full_name, username)")
        .order("date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const leaveQuery = useQuery({
    queryKey: ["admin-leave-applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_applications")
        .select("*, profiles:user_id(full_name, username), leave_types(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <motion.div className="p-4 space-y-6 max-w-6xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin-controls")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Attendance Management</h1>
          <p className="text-sm text-muted-foreground">Manage team attendance and leave</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Attendance</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendanceQuery.isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
              ) : (attendanceQuery.data || []).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No attendance records</TableCell></TableRow>
              ) : (
                (attendanceQuery.data || []).map((record: any) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{(record.profiles as any)?.full_name || (record.profiles as any)?.username || "—"}</TableCell>
                    <TableCell>{record.date}</TableCell>
                    <TableCell>{record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString() : "—"}</TableCell>
                    <TableCell>{record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString() : "—"}</TableCell>
                    <TableCell>{record.total_hours ? `${record.total_hours.toFixed(1)}h` : "—"}</TableCell>
                    <TableCell><Badge variant={record.status === "present" ? "default" : "secondary"}>{record.status}</Badge></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leave Applications</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaveQuery.isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
              ) : (leaveQuery.data || []).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No leave applications</TableCell></TableRow>
              ) : (
                (leaveQuery.data || []).map((leave: any) => (
                  <TableRow key={leave.id}>
                    <TableCell className="font-medium">{(leave.profiles as any)?.full_name || "—"}</TableCell>
                    <TableCell>{(leave.leave_types as any)?.name || "—"}</TableCell>
                    <TableCell>{leave.from_date}</TableCell>
                    <TableCell>{leave.to_date}</TableCell>
                    <TableCell>{leave.total_days}</TableCell>
                    <TableCell><Badge variant={leave.status === "approved" ? "default" : leave.status === "rejected" ? "destructive" : "secondary"}>{leave.status}</Badge></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </motion.div>
  );
}
