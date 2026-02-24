import { Bell, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

export function AppHeader() {
  const sidebar = useSidebar();

  return (
    <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-md border-b border-border">
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-3">
          <div className="hidden md:block">
            <SidebarTrigger />
          </div>
          <div className="flex items-center gap-2.5">
            <Avatar className="h-8 w-8 border-2 border-primary/20">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                RK
              </AvatarFallback>
            </Avatar>
            <div className="leading-tight">
              <p className="text-xs text-muted-foreground">Welcome back</p>
              <p className="text-sm font-semibold">Rajesh Kumar</p>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent animate-pulse-dot" />
        </Button>
      </div>
    </header>
  );
}
