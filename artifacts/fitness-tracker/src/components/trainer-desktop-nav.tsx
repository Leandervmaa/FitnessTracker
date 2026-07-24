import { Link, useLocation } from "wouter";
import {
  BarChart2,
  BookOpen,
  CalendarDays,
  FileSpreadsheet,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/components/auth-context";
import { useClient } from "@/components/client-context";

const trainerItems = [
  { href: "/trainer", label: "Klanten", icon: Users, needsClient: false },
  { href: "/weekplanner", label: "Weekplanner", icon: CalendarDays, needsClient: true },
  { href: "/bibliotheek", label: "Bibliotheek", icon: BookOpen, needsClient: false },
  { href: "/vergelijk", label: "Voortgang", icon: BarChart2, needsClient: true },
  { href: "/excel-viewer", label: "Sheet bekijken", icon: FileSpreadsheet, needsClient: true },
];

type TrainerDesktopNavProps = {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
};

export function TrainerDesktopNav({ collapsed, onCollapsedChange }: TrainerDesktopNavProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { activeClientId } = useClient();

  if (user?.role !== "trainer") return null;

  const widthClass = collapsed ? "w-20" : "w-64";
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside className={`hidden lg:flex fixed inset-y-0 left-0 z-40 ${widthClass} border-r border-border bg-background/95 backdrop-blur-md flex-col transition-[width] duration-200 ease-out`}>
      <div className={`border-b border-border p-3 ${collapsed ? "flex flex-col items-center gap-3" : "flex items-center justify-between gap-3"}`}>
        <div className="h-11 w-11 rounded-lg border border-border bg-card flex items-center justify-center shadow-sm shrink-0">
          <img src="/images/logo.png" alt="Bodyrebuild" className="h-6 w-6 object-contain" />
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => onCollapsedChange(!collapsed)}
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          title={collapsed ? "Menu uitklappen" : "Menu inklappen"}
        >
          <ToggleIcon className="h-5 w-5" />
        </Button>
      </div>

      <nav className={`flex-1 overflow-y-auto ${collapsed ? "p-2 space-y-2" : "p-3 space-y-1"}`}>
        {trainerItems.map(({ href, label, icon: Icon, needsClient }) => {
          const isActive = location === href || location.startsWith(`${href}/`);
          const disabled = needsClient && !activeClientId;
          const target = disabled ? "/trainer" : href;
          const link = (
            <Link
              key={href}
              href={target}
              aria-label={label}
              className={`
                flex items-center rounded-lg text-sm font-bold transition-colors
                ${collapsed ? "h-12 justify-center px-0" : "gap-3 px-3 py-2.5"}
                ${isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}
                ${disabled ? "opacity-45" : ""}
              `}
            >
              <Icon className={`${collapsed ? "h-6 w-6" : "h-5 w-5"} shrink-0`} />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );

          if (!collapsed) return link;

          return (
            <Tooltip key={href}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">
                {label}
                {disabled ? " - kies eerst een klant" : ""}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <div className={`border-t border-border ${collapsed ? "p-2 flex flex-col items-center gap-2" : "p-3 space-y-2"}`}>
        {collapsed ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`h-11 w-11 rounded-lg flex items-center justify-center ${activeClientId ? "bg-primary/10 text-primary" : "bg-muted/60 text-muted-foreground"}`}>
                  <Users className="h-5 w-5" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                {activeClientId ? "Klant geselecteerd" : "Geen klant geselecteerd"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={logout} className="h-11 w-11 text-muted-foreground hover:text-foreground" title="Uitloggen">
                  <LogOut className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Uitloggen</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <>
            <div className="rounded-lg bg-muted/60 px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {activeClientId ? "Klant geselecteerd" : "Geen klant geselecteerd"}
              </p>
              <p className="text-sm font-bold text-foreground truncate">
                {activeClientId ? "Klant geselecteerd" : "Kies een klant"}
              </p>
            </div>
            <Button variant="ghost" onClick={logout} className="w-full justify-start font-bold text-muted-foreground">
              <LogOut className="h-5 w-5 mr-2" />
              Uitloggen
            </Button>
          </>
        )}
      </div>
    </aside>
  );
}
