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

// Types
interface UserProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  phone_number: string | null;
  profile_picture_url: string | null;
  user_status: string;
  created_at: string;
}

interface Employee {
  user_id: string;
  monthly_salary: number;
  daily_da_allowance: number;
  manager_id: string | null;
  hq: string | null;
  date_of_joining: string | null;
  band: string | null;
}

interface UserRole {
  user_id: string;
  role: string;
}

// Fetch hooks
function useProfiles() {
  return useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as UserProfile[];
    },
  });
}

function useEmployees() {
  return useQuery({
    queryKey: ["admin-employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*");
      if (error) throw error;
      return data as Employee[];
    },
  });
}

function useUserRoles() {
  return useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data as UserRole[];
    },
  });
}

function useSecurityProfiles() {
  return useQuery({
    queryKey: ["security-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("security_profiles").select("*");
      if (error) throw error;
      return data as { id: string; name: string; description: string | null; is_system: boolean }[];
    },
  });
}

// Create User Form Component
function CreateUserForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<string>("user");
  const [hq, setHq] = useState("");
  const [salary, setSalary] = useState("");
  const [da, setDa] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !fullName) {
      toast.error("Email, password, and full name are required");
      return;
    }
    setLoading(true);
    try {
      // Call edge function to create user server-side (preserves admin session)
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
          role,
          hq: hq || null,
          salary: salary || "0",
          da: da || "0",
          date_of_joining: dateOfJoining || null,
        },
      });

      if (res.error) throw new Error(res.error.message || "Failed to create user");
      const result = res.data;
      if (result?.error) throw new Error(result.error);

      toast.success(`User ${fullName} created successfully`);
      
      // Refetch all user data from database
      await queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-employees"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      onSuccess();

      // Reset form
      setEmail(""); setPassword(""); setFullName(""); setUsername("");
      setPhone(""); setRole("user"); setHq(""); setSalary(""); setDa(""); setDateOfJoining("");
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
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Field User</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
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

// User Detail Sheet
function UserDetailDialog({ user, employee, role }: { user: UserProfile; employee?: Employee; role?: string }) {
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
              <AvatarImage src={user.profile_picture_url || undefined} />
              <AvatarFallback className="gradient-hero text-primary-foreground text-lg">
                {(user.full_name || user.username || "U").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-lg">{user.full_name || "—"}</h3>
              <p className="text-sm text-muted-foreground">@{user.username || "—"}</p>
              <Badge variant={user.user_status === "active" ? "default" : "secondary"}>
                {user.user_status}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{user.phone_number || "—"}</span></div>
            <div><span className="text-muted-foreground">Role:</span> <Badge variant="outline">{role || "user"}</Badge></div>
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

// Hierarchy View
function UserHierarchy({ profiles, employees, roles }: { profiles: UserProfile[]; employees: Employee[]; roles: UserRole[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Build tree: find users with no manager (top level)
  const topLevel = profiles.filter((p) => {
    const emp = employees.find((e) => e.user_id === p.id);
    return !emp?.manager_id;
  });

  const getChildren = (managerId: string) => {
    return profiles.filter((p) => {
      const emp = employees.find((e) => e.user_id === p.id);
      return emp?.manager_id === managerId;
    });
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpanded(newExpanded);
  };

  const renderNode = (user: UserProfile, level: number) => {
    const children = getChildren(user.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(user.id);
    const role = roles.find((r) => r.user_id === user.id);

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
            <AvatarFallback className={role?.role === "admin" ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"}>
              {(user.full_name || "U").charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.full_name || user.username}</p>
            <p className="text-xs text-muted-foreground">{role?.role || "user"}</p>
          </div>
          {hasChildren && <Badge variant="secondary" className="text-xs">{children.length}</Badge>}
        </div>
        {isExpanded && children.map((child) => renderNode(child, level + 1))}
      </div>
    );
  };

  if (profiles.length === 0) {
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

  const { data: profiles = [], isLoading: profilesLoading } = useProfiles();
  const { data: employees = [] } = useEmployees();
  const { data: userRoles = [] } = useUserRoles();
  const { data: securityProfiles = [] } = useSecurityProfiles();

  const queryClient = useQueryClient();

  const filteredProfiles = profiles.filter(
    (p) =>
      (p.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.username || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.phone_number || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleStatus = useMutation({
    mutationFn: async ({ userId, newStatus }: { userId: string; newStatus: string }) => {
      const { error } = await supabase.from("profiles").update({ user_status: newStatus }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      toast.success("User status updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const stats = {
    total: profiles.length,
    active: profiles.filter((p) => p.user_status === "active").length,
    admins: userRoles.filter((r) => r.role === "admin").length,
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

          {profilesLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading users...</div>
          ) : filteredProfiles.length === 0 ? (
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
                    <TableHead className="hidden md:table-cell">HQ</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProfiles.map((user) => {
                    const employee = employees.find((e) => e.user_id === user.id);
                    const role = userRoles.find((r) => r.user_id === user.id);
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={user.profile_picture_url || undefined} />
                              <AvatarFallback className="gradient-hero text-primary-foreground text-xs">
                                {(user.full_name || user.username || "U").charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{user.full_name || "—"}</p>
                              <p className="text-xs text-muted-foreground truncate">@{user.username || "—"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant={role?.role === "admin" ? "default" : "outline"} className="text-xs">
                            {role?.role || "user"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{employee?.hq || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={user.user_status === "active" ? "default" : "secondary"} className="text-xs">
                            {user.user_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <UserDetailDialog user={user} employee={employee} role={role?.role} />
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => toggleStatus.mutate({
                                    userId: user.id,
                                    newStatus: user.user_status === "active" ? "inactive" : "active",
                                  })}
                                >
                                  {user.user_status === "active" ? "Deactivate" : "Activate"}
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
              <CreateUserForm onSuccess={() => setActiveTab("users")} />
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
              <UserHierarchy profiles={profiles} employees={employees} roles={userRoles} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Roles Tab */}
        <TabsContent value="roles">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-lg">Security Profiles</CardTitle>
            </CardHeader>
            <CardContent>
              {securityProfiles.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No security profiles configured.</p>
              ) : (
                <div className="space-y-3">
                  {securityProfiles.map((sp) => (
                    <div key={sp.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="font-medium text-sm">{sp.name}</p>
                        <p className="text-xs text-muted-foreground">{sp.description}</p>
                      </div>
                      {sp.is_system && <Badge variant="outline" className="text-xs">System</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
