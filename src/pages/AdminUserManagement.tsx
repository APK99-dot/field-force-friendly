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
import {
  ArrowLeft,
  Search,
  UserPlus,
  Users,
  Network,
  Shield,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
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

// Create User Form Component
function CreateUserForm({ roles, onSuccess }: { roles: Role[]; onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [roleId, setRoleId] = useState<string>("");
  const [hq, setHq] = useState("");
  const [salary, setSalary] = useState("");
  const [da, setDa] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  // Map role id → old enum for edge function compat
  const roleEnumMap: Record<string, string> = {};
  roles.forEach((r) => {
    if (r.name === "Admin") roleEnumMap[r.id] = "admin";
    else if (r.name === "Field User") roleEnumMap[r.id] = "user";
    else if (r.name === "Sales Manager") roleEnumMap[r.id] = "sales_manager";
    else if (r.name === "Data Viewer") roleEnumMap[r.id] = "data_viewer";
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !fullName) {
      toast.error("Email, password, and full name are required");
      return;
    }
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("You must be logged in as admin");

      const res = await supabase.functions.invoke("admin-create-user", {
        body: {
          email,
          password,
          full_name: fullName,
          username: username || email,
          phone,
          role: roleId ? roleEnumMap[roleId] || "user" : "user",
          hq: hq || null,
          salary: salary || "0",
          da: da || "0",
          date_of_joining: dateOfJoining || null,
        },
      });

      if (res.error) throw new Error(res.error.message || "Failed to create user");
      const result = res.data;
      if (result?.error) throw new Error(result.error);

      // Set role_id on users table
      if (roleId && result?.user_id) {
        await supabase.from("users").update({ role_id: roleId, phone: phone || null }).eq("id", result.user_id);
      }

      toast.success(`User ${fullName} created successfully`);
      await queryClient.invalidateQueries({ queryKey: ["admin-app-users"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-employees"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      onSuccess();

      setEmail(""); setPassword(""); setFullName(""); setUsername("");
      setPhone(""); setRoleId(""); setHq(""); setSalary(""); setDa(""); setDateOfJoining("");
    } catch (err: any) {
      toast.error(err.message || "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleCreate} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cu-email">Email *</Label>
          <Input id="cu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="user@company.com" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cu-password">Password *</Label>
          <Input id="cu-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Min 6 characters" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cu-fullname">Full Name *</Label>
          <Input id="cu-fullname" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="John Doe" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cu-username">Username</Label>
          <Input id="cu-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="johndoe" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cu-phone">Phone Number</Label>
          <Input id="cu-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 9876543210" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cu-role">Role</Label>
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
          <Label htmlFor="cu-hq">Headquarters</Label>
          <Input id="cu-hq" value={hq} onChange={(e) => setHq(e.target.value)} placeholder="City/Office" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cu-doj">Date of Joining</Label>
          <Input id="cu-doj" type="date" value={dateOfJoining} onChange={(e) => setDateOfJoining(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cu-salary">Monthly Salary (₹)</Label>
          <Input id="cu-salary" type="number" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cu-da">Daily DA Allowance (₹)</Label>
          <Input id="cu-da" type="number" value={da} onChange={(e) => setDa(e.target.value)} placeholder="0" />
        </div>
      </div>
      <Button type="submit" className="w-full gradient-hero text-primary-foreground" disabled={loading}>
        {loading ? "Creating User..." : "Create User"}
      </Button>
    </form>
  );
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
              <AvatarFallback className="gradient-hero text-primary-foreground text-lg">
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
  const [loading, setLoading] = useState(false);

  // Map role id → old enum for user_roles compat
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
      // Update users table (role_id, reporting_manager_id, phone, full_name, username)
      const { error: userError } = await supabase.from("users").update({
        full_name: fullName || null,
        username: username || null,
        phone: phone || null,
        role_id: roleId || null,
        reporting_manager_id: managerId === "none" ? null : managerId,
      }).eq("id", user.id);
      if (userError) throw userError;

      // Sync profile table
      const { error: profileError } = await supabase.from("profiles").update({
        full_name: fullName || null,
        username: username || null,
        phone_number: phone || null,
      }).eq("id", user.id);
      if (profileError) throw profileError;

      // Sync user_roles for backward compat with RLS
      if (roleId && roleEnumMap[roleId]) {
        await supabase.from("user_roles").update({
          role: roleEnumMap[roleId] as any,
        }).eq("user_id", user.id);
      }

      // Update employee record (upsert)
      const { error: empError } = await supabase.from("employees").upsert({
        user_id: user.id,
        hq: hq || null,
        monthly_salary: parseFloat(salary) || 0,
        daily_da_allowance: parseFloat(da) || 0,
        band: band || null,
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

// User Hierarchy
function UserHierarchy({ users, roles }: { users: AppUser[]; roles: Role[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const roleMap = new Map(roles.map((r) => [r.id, r.name]));

  const topLevel = users.filter((u) => !u.reporting_manager_id && u.is_active);

  const getChildren = (managerId: string) =>
    users.filter((u) => u.reporting_manager_id === managerId && u.is_active);

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const renderNode = (user: AppUser, level: number) => {
    const children = getChildren(user.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(user.id);
    const roleName = user.role_id ? roleMap.get(user.role_id) || "—" : "—";

    return (
      <div key={user.id} style={{ marginLeft: level * 24 }}>
        <div
          className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
          onClick={() => hasChildren && toggleExpand(user.id)}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <div className="w-4" />
          )}
          <Avatar className="h-8 w-8">
            <AvatarFallback className={roleName === "Admin" ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"}>
              {(user.full_name || "U").charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.full_name || user.email}</p>
            <p className="text-xs text-muted-foreground">{roleName}</p>
          </div>
          {hasChildren && <Badge variant="secondary" className="text-xs">{children.length}</Badge>}
        </div>
        {isExpanded && children.map((child) => renderNode(child, level + 1))}
      </div>
    );
  };

  if (users.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Network className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No users found. Create users to see the hierarchy.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {topLevel.map((user) => renderNode(user, 0))}
    </div>
  );
}

export default function AdminUserManagement() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("users");
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);

  const { data: appUsers = [], isLoading: usersLoading } = useAppUsers();
  const { data: employees = [] } = useEmployees();
  const { data: roles = [] } = useRoles();
  const { data: profiles = [] } = useProfiles();

  const queryClient = useQueryClient();

  const roleMap = new Map(roles.map((r) => [r.id, r.name]));

  const filteredUsers = appUsers.filter(
    (u) =>
      (u.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.phone || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-app-users"] });
    queryClient.invalidateQueries({ queryKey: ["admin-employees"] });
    queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
  };

  const toggleActive = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { error } = await supabase.from("users").update({ is_active: isActive }).eq("id", userId);
      if (error) throw error;
      // Sync profile status
      await supabase.from("profiles").update({ user_status: isActive ? "active" : "inactive" }).eq("id", userId);
    },
    onSuccess: () => { invalidateAll(); toast.success("User status updated"); },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      await supabase.from("employees").delete().eq("user_id", userId);
      await supabase.from("user_roles").delete().eq("user_id", userId);
      await supabase.from("users").delete().eq("id", userId);
      await supabase.from("profiles").update({ user_status: "deleted" }).eq("id", userId);
    },
    onSuccess: () => { invalidateAll(); toast.success("User deleted"); setDeleteTarget(null); },
    onError: (err: any) => toast.error(err.message),
  });

  const stats = {
    total: appUsers.length,
    active: appUsers.filter((u) => u.is_active).length,
    admins: appUsers.filter((u) => u.role_id && roleMap.get(u.role_id) === "Admin").length,
  };

  return (
    <motion.div
      className="p-4 space-y-6 max-w-6xl mx-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin-controls")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-sm text-muted-foreground">Manage user accounts, roles, and organization hierarchy</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="shadow-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total Users</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-success">{stats.active}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-accent">{stats.admins}</p>
            <p className="text-xs text-muted-foreground">Admins</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="users" className="text-xs"><Users className="h-3.5 w-3.5 mr-1" />Users</TabsTrigger>
          <TabsTrigger value="create" className="text-xs"><UserPlus className="h-3.5 w-3.5 mr-1" />Create</TabsTrigger>
          <TabsTrigger value="hierarchy" className="text-xs"><Network className="h-3.5 w-3.5 mr-1" />Hierarchy</TabsTrigger>
          <TabsTrigger value="roles" className="text-xs"><Shield className="h-3.5 w-3.5 mr-1" />Roles</TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search users..." className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>

          {usersLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading users...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No users found. Create your first user in the "Create" tab.</p>
            </div>
          ) : (
            <Card className="shadow-card overflow-hidden">
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
                  {filteredUsers.map((user) => {
                    const employee = employees.find((e) => e.user_id === user.id);
                    const roleName = user.role_id ? roleMap.get(user.role_id) || "—" : "—";
                    const manager = user.reporting_manager_id ? appUsers.find((u) => u.id === user.reporting_manager_id) : null;
                    const profile = profiles.find((p) => p.id === user.id);
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={profile?.profile_picture_url || undefined} />
                              <AvatarFallback className="gradient-hero text-primary-foreground text-xs">
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
                          <Badge variant={roleName === "Admin" ? "default" : "outline"} className="text-xs">
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
                                <EditUserDialog
                                  user={user}
                                  employee={employee}
                                  roles={roles}
                                  allUsers={appUsers}
                                  onSaved={invalidateAll}
                                />
                                <DropdownMenuItem
                                  onClick={() => toggleActive.mutate({
                                    userId: user.id,
                                    isActive: !user.is_active,
                                  })}
                                >
                                  {user.is_active ? "Deactivate" : "Activate"}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteTarget(user)}
                                >
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
            </Card>
          )}
        </TabsContent>

        {/* Create User Tab */}
        <TabsContent value="create">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-lg">Create New User</CardTitle>
            </CardHeader>
            <CardContent>
              <CreateUserForm roles={roles} onSuccess={() => setActiveTab("users")} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Hierarchy Tab */}
        <TabsContent value="hierarchy">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-lg">Organization Hierarchy</CardTitle>
            </CardHeader>
            <CardContent>
              <UserHierarchy users={appUsers} roles={roles} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Roles Tab */}
        <TabsContent value="roles">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-lg">Roles</CardTitle>
            </CardHeader>
            <CardContent>
              {roles.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No roles configured.</p>
              ) : (
                <div className="space-y-3">
                  {roles.map((r) => (
                    <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="font-medium text-sm">{r.name}</p>
                      </div>
                      {r.is_system && <Badge variant="outline" className="text-xs">System</Badge>}
                    </div>
                  ))}
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
