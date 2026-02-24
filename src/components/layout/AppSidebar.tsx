import {
  Home,
  MapPin,
  Clock,
  Receipt,
  Users,
  Settings,
  BarChart3,
  Map,
  Shield,
  Building2,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const fieldItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Visits", url: "/visits", icon: MapPin },
  { title: "Attendance", url: "/attendance", icon: Clock },
  { title: "Expenses", url: "/expenses", icon: Receipt },
  { title: "GPS Tracking", url: "/gps-tracking", icon: Map },
];

const adminItems = [
  { title: "Admin Panel", url: "/admin", icon: Shield },
  { title: "User Management", url: "/admin/users", icon: Users },
  { title: "Reports", url: "/admin/reports", icon: BarChart3 },
  { title: "Settings", url: "/admin/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="hidden md:flex">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center flex-shrink-0">
            <Building2 className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="font-bold text-sm tracking-tight">
              Bharath Builders
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Field Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {fieldItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Administration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        {!collapsed && (
          <p className="text-[10px] text-sidebar-foreground/50 text-center">
            v1.0 • Bharath Builders
          </p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
