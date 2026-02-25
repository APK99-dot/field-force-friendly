import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function AdminExpenseManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const expensesQuery = useQuery({
    queryKey: ["admin-all-expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("additional_expenses")
        .select("*, profiles:user_id(full_name, username)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("additional_expenses").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-expenses"] });
      toast.success("Status updated");
    },
  });

  return (
    <motion.div className="p-4 space-y-6 max-w-6xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin-controls")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Expense Management</h1>
          <p className="text-sm text-muted-foreground">Review and manage expense claims</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">All Expenses</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expensesQuery.isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
              ) : (expensesQuery.data || []).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No expenses found</TableCell></TableRow>
              ) : (
                (expensesQuery.data || []).map((exp: any) => (
                  <TableRow key={exp.id}>
                    <TableCell className="font-medium">{(exp.profiles as any)?.full_name || "—"}</TableCell>
                    <TableCell>{exp.expense_date}</TableCell>
                    <TableCell>{exp.category}</TableCell>
                    <TableCell className="font-medium">₹{Number(exp.amount).toFixed(0)}</TableCell>
                    <TableCell>
                      <Badge variant={exp.status === "approved" ? "default" : exp.status === "rejected" ? "destructive" : "secondary"}>
                        {exp.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {exp.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => updateStatus.mutate({ id: exp.id, status: "approved" })}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs h-7 text-destructive" onClick={() => updateStatus.mutate({ id: exp.id, status: "rejected" })}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </TableCell>
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
