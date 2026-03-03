import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ArrowLeft,
  Search,
  Users,
  Network,
  Shield,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  BarChart3,
  UserPlus,
  List,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import CreateUserWizard from "@/components/admin/create-user/CreateUserWizard";

// Types
interface Role {
  id: string;
  name: string;
  is_system: boolean;
}

interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  username: string | null;
  phone: string | null;
  role_id: string | null;
  reporting_manager_id: string | null;
  is_active: boolean;
  created_at: string;
}

interface Employee {
  user_id: string;
  monthly_salary: number;
  daily_da_allowance: number;
  hq: string | null;
  date_of_joining: string | null;
  band: string | null;
}

// Role color mapping matching reference
const roleColorMap: Record<string, { border: string; text: string; bg: string; badge: string }> = {
  "Admin": { border: "border-t-rose-500", text: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/10", badge: "bg-rose-500" },
  "Sales Manager": { border: "border-t-emerald-500", text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", badge: "bg-emerald-500" },
  "Field User": { border: "border-t-blue-500", text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", badge: "bg-blue-500" },
  "Data Viewer": { border: "border-t-amber-500", text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", badge: "bg-amber-500" },
};
const defaultRoleColor = { border: "border-t-slate-500", text: "text-slate-600 dark:text-slate-400", bg: "bg-slate-500/10", badge: "bg-slate-500" };
const getRoleColor = (role: string) => roleColorMap[role] || defaultRoleColor;

// Fetch hooks
function useRoles() {
  return useQuery({
    queryKey: ["roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("roles").select("*").order("name");
      if (error) throw error;
      return (data || []) as Role[];
    },
  });
}

function useAppUsers() {
  return useQuery({
    queryKey: ["admin-app-users"],
    queryFn: async () => {
      const { data, error } = await supabase.from("users").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as AppUser[];
    },
  });
}

function useEmployees() {
  return useQuery({
    queryKey: ["admin-employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*");
      if (error) throw error;
      return (data || []) as Employee[];
    },
  });
}

function useProfiles() {
  return useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, profile_picture_url, user_status");
      if (error) throw error;
      return (data || []) as { id: string; profile_picture_url: string | null; user_status: string }[];
    },
  });
}

// User Detail Dialog
function UserDetailDialog({ user, employee, roleName }: { user: AppUser; employee?: Employee; roleName: string }) {
  const { data: profiles = [] } = useProfiles();
  const profile = profiles.find((p) => p.id === user.id);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
          <DialogDescription>Complete profile information</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile?.profile_picture_url || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                {(user.full_name || user.username || "U").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-lg">{user.full_name || "—"}</h3>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <Badge variant={user.is_active ? "default" : "secondary"}>
                {user.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{user.phone || "—"}</span></div>
            <div><span className="text-muted-foreground">Role:</span> <Badge variant="outline">{roleName}</Badge></div>
            <div><span className="text-muted-foreground">HQ:</span> <span className="font-medium">{employee?.hq || "—"}</span></div>
            <div><span className="text-muted-foreground">Band:</span> <span className="font-medium">{employee?.band || "—"}</span></div>
            <div><span className="text-muted-foreground">Salary:</span> <span className="font-medium">₹{employee?.monthly_salary?.toLocaleString() || "0"}</span></div>
            <div><span className="text-muted-foreground">DA:</span> <span className="font-medium">₹{employee?.daily_da_allowance?.toLocaleString() || "0"}</span></div>
            <div><span className="text-muted-foreground">Joined:</span> <span className="font-medium">{employee?.date_of_joining || "—"}</span></div>
            <div><span className="text-muted-foreground">Created:</span> <span className="font-medium">{new Date(user.created_at).toLocaleDateString()}</span></div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Edit User Dialog
function EditUserDialog({ user, employee, roles, allUsers, onSaved }: {
  user: AppUser;
  employee?: Employee;
  roles: Role[];
  allUsers: AppUser[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(user.full_name || "");
  const [username, setUsername] = useState(user.username || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [roleId, setRoleId] = useState(user.role_id || "");
  const [managerId, setManagerId] = useState(user.reporting_manager_id || "none");
  const [hq, setHq] = useState(employee?.hq || "");
  const [salary, setSalary] = useState(String(employee?.monthly_salary || 0));
  const [da, setDa] = useState(String(employee?.daily_da_allowance || 0));
  const [band, setBand] = useState(employee?.band || "");
  const [dateOfJoining, setDateOfJoining] = useState(employee?.date_of_joining || "");
  const [loading, setLoading] = useState(false);

  const roleEnumMap: Record<string, string> = {};
  roles.forEach((r) => {
    if (r.name === "Admin") roleEnumMap[r.id] = "admin";
    else if (r.name === "Field User") roleEnumMap[r.id] = "user";
    else if (r.name === "Sales Manager") roleEnumMap[r.id] = "sales_manager";
    else if (r.name === "Data Viewer") roleEnumMap[r.id] = "data_viewer";
  });

  const managerOptions = allUsers.filter((u) => u.id !== user.id && u.is_active);

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error: userError } = await supabase.from("users").update({
        full_name: fullName || null,
        username: username || null,
        phone: phone || null,
        role_id: roleId || null,
        reporting_manager_id: managerId === "none" ? null : managerId,
      }).eq("id", user.id);
      if (userError) throw userError;

      const { error: profileError } = await supabase.from("profiles").update({
        full_name: fullName || null,
        username: username || null,
        phone_number: phone || null,
      }).eq("id", user.id);
      if (profileError) throw profileError;

      if (roleId && roleEnumMap[roleId]) {
        await supabase.from("user_roles").update({
          role: roleEnumMap[roleId] as any,
        }).eq("user_id", user.id);
      }

      const { error: empError } = await supabase.from("employees").upsert({
        user_id: user.id,
        hq: hq || null,
        monthly_salary: parseFloat(salary) || 0,
        daily_da_allowance: parseFloat(da) || 0,
        band: band || null,
        date_of_joining: dateOfJoining || null,
        manager_id: managerId === "none" ? null : managerId,
      }, { onConflict: "user_id" });
      if (empError) throw empError;

      toast.success("User updated successfully");
      setOpen(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to update user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }}>
          <Edit className="h-4 w-4 mr-2" /> Edit
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>Update user profile and role</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Email</Label>
            <Input value={user.email} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">Email cannot be changed after creation</p>
          </div>
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Reporting Manager</Label>
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {managerOptions.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date of Joining</Label>
            <Input type="date" value={dateOfJoining} onChange={(e) => setDateOfJoining(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>HQ</Label>
            <Input value={hq} onChange={(e) => setHq(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Band</Label>
            <Input value={band} onChange={(e) => setBand(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Monthly Salary (₹)</Label>
            <Input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Daily DA (₹)</Label>
            <Input type="number" value={da} onChange={(e) => setDa(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===== User Hierarchy with tree/list toggle =====
function UserHierarchy({ users, roles, profiles }: { users: AppUser[]; roles: Role[]; profiles: { id: string; profile_picture_url: string | null }[] }) {
  const [viewMode, setViewMode] = useState<"tree" | "list">("tree");
  const roleMap = new Map(roles.map((r) => [r.id, r.name]));
  const activeUsers = users.filter(u => u.is_active);
  const topLevel = activeUsers.filter((u) => !u.reporting_manager_id);
  const getChildren = (managerId: string) =>
    activeUsers.filter((u) => u.reporting_manager_id === managerId);

  // Collect unique roles for legend
  const allRoleNames = new Set<string>();
  activeUsers.forEach(u => {
    const rn = u.role_id ? roleMap.get(u.role_id) : null;
    if (rn) allRoleNames.add(rn);
  });

  // Org chart tree node
  const renderOrgNode = (user: AppUser): React.ReactNode => {
    const children = getChildren(user.id);
    const roleName = user.role_id ? roleMap.get(user.role_id) || "—" : "—";
    const profile = profiles.find((p) => p.id === user.id);
    const colors = getRoleColor(roleName);

    return (
      <div key={user.id} className="flex flex-col items-center">
        <div className="flex flex-col items-center w-24">
          <div className={`rounded-full p-[2px] ring-2 ${colors.border.replace('border-t-', 'ring-')}`}>
            <Avatar className="h-12 w-12">
              <AvatarImage src={profile?.profile_picture_url || undefined} />
              <AvatarFallback className={`text-sm font-semibold text-white ${colors.badge}`}>
                {(user.full_name || "U").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
          <p className="text-[11px] font-medium text-center mt-1 leading-tight truncate w-full">
            {user.full_name || user.email}
          </p>
          <p className={`text-[9px] text-center truncate w-full ${colors.text}`}>{roleName}</p>
        </div>
        {children.length > 0 && (
          <>
            <div className="w-px h-4 bg-border" />
            <div className="relative flex items-start">
              {children.length > 1 && (
                <div
                  className="absolute top-0 h-px bg-border"
                  style={{
                    left: `calc(50% - ${(children.length - 1) * 52}px)`,
                    width: `${(children.length - 1) * 104}px`,
                  }}
                />
              )}
              <div className="flex gap-2">
                {children.map(child => (
                  <div key={child.id} className="flex flex-col items-center">
                    <div className="w-px h-4 bg-border" />
                    {renderOrgNode(child)}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  // List view row with collapsible children
  const HierarchyRow = ({ user, level = 0 }: { user: AppUser; level?: number }) => {
    const [isOpen, setIsOpen] = useState(level < 1);
    const children = getChildren(user.id);
    const hasReports = children.length > 0;
    const roleName = user.role_id ? roleMap.get(user.role_id) || "—" : "—";
    const colors = getRoleColor(roleName);
    const profile = profiles.find(p => p.id === user.id);

    const levelAccents = [
      'border-l-rose-500', 'border-l-purple-500', 'border-l-blue-500',
      'border-l-emerald-500', 'border-l-amber-500', 'border-l-cyan-500',
    ];
    const accentClass = levelAccents[Math.min(level, levelAccents.length - 1)];

    return (
      <div className={level > 0 ? "ml-3 md:ml-5" : ""}>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <div className={`flex items-center gap-2.5 p-2 rounded-lg border-l-[3px] transition-colors ${accentClass} ${hasReports ? "cursor-pointer hover:bg-muted/60" : ""}`}>
            {hasReports ? (
              <CollapsibleTrigger asChild>
                <button className="shrink-0 p-0.5 rounded hover:bg-muted">
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </CollapsibleTrigger>
            ) : (
              <div className="w-[18px]" />
            )}
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarImage src={profile?.profile_picture_url || undefined} />
              <AvatarFallback className={`text-[10px] font-semibold text-white ${colors.badge}`}>
                {(user.full_name || "U").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate leading-tight">{user.full_name || user.email}</p>
            </div>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 shrink-0 font-medium border ${colors.bg} ${colors.text}`}>
              {roleName}
            </Badge>
            {hasReports && (
              <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{children.length}</span>
            )}
          </div>
          {hasReports && (
            <CollapsibleContent className="pt-1 space-y-1">
              {children.map(child => (
                <HierarchyRow key={child.id} user={child} level={level + 1} />
              ))}
            </CollapsibleContent>
          )}
        </Collapsible>
      </div>
    );
  };

  if (activeUsers.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Network className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No users found. Create users to see the hierarchy.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> User Hierarchy
          </CardTitle>
          <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as "tree" | "list")} size="sm">
            <ToggleGroupItem value="tree" aria-label="Tree view" className="h-7 w-7 p-0">
              <Network className="h-3.5 w-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view" className="h-7 w-7 p-0">
              <List className="h-3.5 w-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        {/* Role color legend */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {Array.from(allRoleNames).map((rn) => {
            const c = getRoleColor(rn);
            return (
              <span
                key={rn}
                className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${c.bg} ${c.text}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${c.badge}`} />
                {rn}
              </span>
            );
          })}
        </div>
      </CardHeader>
      <CardContent>
        {viewMode === "tree" ? (
          <ScrollArea className="w-full">
            <div className="flex justify-center py-4 min-w-max">
              <div className="flex gap-6">
                {topLevel.map(user => renderOrgNode(user))}
              </div>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        ) : (
          <div className="space-y-1">
            {topLevel.map(user => (
              <HierarchyRow key={user.id} user={user} level={0} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Pagination component
function TablePagination({ total, page, pageSize, onPageChange }: {
  total: number; page: number; pageSize: number; onPageChange: (p: number) => void;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t">
      <p className="text-sm text-muted-foreground">
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </p>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
          Math.max(0, page - 3),
          Math.min(totalPages, page + 2)
        ).map((p) => (
          <Button key={p} variant={p === page ? "default" : "outline"} size="sm" onClick={() => onPageChange(p)}>
            {p}
          </Button>
        ))}
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

export default function AdminUserManagement() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data: appUsers = [], isLoading: usersLoading } = useAppUsers();
  const { data: employees = [] } = useEmployees();
  const { data: roles = [] } = useRoles();
  const { data: profiles = [] } = useProfiles();

  const queryClient = useQueryClient();
  const roleMap = new Map(roles.map((r) => [r.id, r.name]));

  const filteredUsers = appUsers.filter((u) => {
    const matchesSearch =
      (u.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.phone || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || (u.role_id && roleMap.get(u.role_id) === roleFilter);
    return matchesSearch && matchesRole;
  });

  const paginatedUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-app-users"] });
    queryClient.invalidateQueries({ queryKey: ["admin-employees"] });
    queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
  };

  const toggleActive = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { error } = await supabase.from("users").update({ is_active: isActive }).eq("id", userId);
      if (error) throw error;
      await supabase.from("profiles").update({ user_status: isActive ? "active" : "inactive" }).eq("id", userId);
    },
    onSuccess: () => { invalidateAll(); toast.success("User status updated"); },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      await supabase.from("users").update({ reporting_manager_id: null }).eq("reporting_manager_id", userId);
      await supabase.from("employees").update({ manager_id: null }).eq("manager_id", userId);
      await supabase.from("leave_balance").delete().eq("user_id", userId);
      await supabase.from("leave_applications").delete().eq("user_id", userId);
      await supabase.from("employee_documents").delete().eq("user_id", userId);
      await supabase.from("activity_events").delete().eq("user_id", userId);
      await supabase.from("attendance").delete().eq("user_id", userId);
      await supabase.from("gps_tracking").delete().eq("user_id", userId);
      await supabase.from("gps_tracking_stops").delete().eq("user_id", userId);
      await supabase.from("additional_expenses").delete().eq("user_id", userId);
      await supabase.from("beat_plans").delete().eq("user_id", userId);
      const { data: userVisits } = await supabase.from("visits").select("id").eq("user_id", userId);
      if (userVisits && userVisits.length > 0) {
        const visitIds = userVisits.map(v => v.id);
        const { data: userOrders } = await supabase.from("orders").select("id").in("visit_id", visitIds);
        if (userOrders && userOrders.length > 0) {
          await supabase.from("order_items").delete().in("order_id", userOrders.map(o => o.id));
        }
        await supabase.from("orders").delete().eq("user_id", userId);
        await supabase.from("visits").delete().eq("user_id", userId);
      }
      await supabase.from("orders").delete().eq("user_id", userId);
      await supabase.from("employees").delete().eq("user_id", userId);
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error: userDelError } = await supabase.from("users").delete().eq("id", userId);
      if (userDelError) throw userDelError;
      await supabase.from("profiles").update({ user_status: "deleted" }).eq("id", userId);
    },
    onSuccess: () => { invalidateAll(); toast.success("User deleted"); setDeleteTarget(null); },
    onError: (err: any) => toast.error(err.message || "Failed to delete user"),
  });

  // Per-role stats
  const roleCounts = roles.map(r => ({
    name: r.name,
    count: appUsers.filter(u => u.role_id === r.id).length,
  }));

  return (
    <motion.div className="p-4 space-y-6 max-w-6xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" className="p-2" onClick={() => navigate("/admin-controls")}>
          <ArrowLeft size={20} />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground">Manage users, roles, and team hierarchy</p>
        </div>
      </div>

      {/* Role-based stat cards */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {/* Total Users card */}
        <Card className="min-w-[120px] flex-shrink-0 border-t-2 border-t-foreground">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Total Users</p>
            <div className="flex items-center justify-center gap-1.5">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xl font-bold">{appUsers.length}</span>
            </div>
          </CardContent>
        </Card>
        {roleCounts.map((rc) => {
          const colors = getRoleColor(rc.name);
          return (
            <Card key={rc.name} className={`min-w-[120px] flex-shrink-0 border-t-2 ${colors.border}`}>
              <CardContent className="p-3 text-center">
                <p className={`text-xs mb-1 ${colors.text}`}>{rc.name}</p>
                <div className="flex items-center justify-center gap-1.5">
                  <Users className={`h-4 w-4 ${colors.text}`} />
                  <span className="text-xl font-bold">{rc.count}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full flex">
          <TabsTrigger value="overview" className="flex-1 text-xs sm:text-sm gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="users" className="flex-1 text-xs sm:text-sm gap-1.5">
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Users & Roles</span>
            <span className="sm:hidden">Users</span>
          </TabsTrigger>
          <TabsTrigger value="create" className="flex-1 text-xs sm:text-sm gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Create User</span>
            <span className="sm:hidden">Create</span>
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex-1 text-xs sm:text-sm gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Roles
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab - Hierarchy */}
        <TabsContent value="overview" className="space-y-4">
          <UserHierarchy users={appUsers} roles={roles} profiles={profiles} />
        </TabsContent>

        {/* Users & Roles Tab */}
        <TabsContent value="users" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search users..." className="pl-9" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} />
            </div>
            <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {usersLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading users...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No users found. Create your first user in the "Create User" tab.</p>
            </div>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead className="hidden md:table-cell">Role</TableHead>
                    <TableHead className="hidden md:table-cell">Manager</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedUsers.map((user) => {
                    const employee = employees.find((e) => e.user_id === user.id);
                    const roleName = user.role_id ? roleMap.get(user.role_id) || "—" : "—";
                    const manager = user.reporting_manager_id ? appUsers.find((u) => u.id === user.reporting_manager_id) : null;
                    const profile = profiles.find((p) => p.id === user.id);
                    const colors = getRoleColor(roleName);
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={profile?.profile_picture_url || undefined} />
                              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                {(user.full_name || user.email || "U").charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{user.full_name || "—"}</p>
                              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge
                            variant="outline"
                            className={`text-xs ${colors.bg} ${colors.text}`}
                          >
                            {roleName}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {manager?.full_name || manager?.email || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.is_active ? "default" : "secondary"} className="text-xs">
                            {user.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <UserDetailDialog user={user} employee={employee} roleName={roleName} />
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <EditUserDialog user={user} employee={employee} roles={roles} allUsers={appUsers} onSaved={invalidateAll} />
                                <DropdownMenuItem onClick={() => toggleActive.mutate({ userId: user.id, isActive: !user.is_active })}>
                                  {user.is_active ? "Deactivate" : "Activate"}
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(user)}>
                                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <TablePagination total={filteredUsers.length} page={page} pageSize={pageSize} onPageChange={setPage} />
            </Card>
          )}
        </TabsContent>

        {/* Create User Tab - Wizard */}
        <TabsContent value="create">
          <CreateUserWizard onSuccess={() => { invalidateAll(); setActiveTab("users"); }} />
        </TabsContent>

        {/* Roles Tab */}
        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Roles</CardTitle>
            </CardHeader>
            <CardContent>
              {roles.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No roles configured.</p>
              ) : (
                <div className="space-y-3">
                  {roles.map((r) => {
                    const colors = getRoleColor(r.name);
                    return (
                      <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${colors.badge}`} />
                          <p className="font-medium text-sm">{r.name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {appUsers.filter(u => u.role_id === r.id).length} users
                          </Badge>
                          {r.is_system && <Badge variant="outline" className="text-xs">System</Badge>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.full_name || deleteTarget?.email}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteUser.mutate(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
