import {
  Home,
  Clock,
  Receipt,
  FolderKanban,
  MoreHorizontal,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";

const tabs = [
  { label: "Home", icon: Home, to: "/dashboard" },
  { label: "Attendance", icon: Clock, to: "/attendance" },
  { label: "Expenses", icon: Receipt, to: "/expenses" },
  { label: "Projects", icon: FolderKanban, to: "/projects" },
  { label: "More", icon: MoreHorizontal, to: "/more" },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card shadow-bottom-nav border-t border-border safe-bottom md:hidden">
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-muted-foreground transition-colors min-w-[56px]"
            activeClassName="text-primary"
          >
            <tab.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
