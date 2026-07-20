import { Link, useLocation } from "wouter";
import {
  BarChart2,
  BookOpen,
  CalendarDays,
  Camera,
  FileSpreadsheet,
  Home,
  LogOut,
  MessageSquare,
  Settings,
  UtensilsCrossed,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-context";
import { useClient } from "@/components/client-context";

const trainerItems = [
  { href: "/trainer", label: "Klanten", icon: Users, needsClient: false },
  { href: "/weekplanner", label: "Weekplanner", icon: CalendarDays, needsClient: true },
  { href: "/bibliotheek", label: "Bibliotheek", icon: BookOpen, needsClient: false },
  { href: "/trainingen", label: "Trainingen", icon: Home, needsClient: true },
  { href: "/dagboek", label: "Eten & dagboek", icon: UtensilsCrossed, needsClient: true },
  { href: "/vergelijk", label: "Vergelijken", icon: BarChart2, needsClient: true },
  { href: "/feedback", label: "Feedback", icon: MessageSquare, needsClient: true },
  { href: "/progressie-fotos", label: "Foto's", icon: Camera, needsClient: true },
  { href: "/excel-viewer", label: "Sheet bekijken", icon: FileSpreadsheet, needsClient: true },
  { href: "/instellen", label: "Instellingen", icon: Settings, needsClient: true },
];

export function TrainerDesktopNav() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { activeClientId } = useClient();

  if (user?.role !== "trainer") return null;

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-64 border-r border-border bg-background/95 backdrop-blur-md flex-col">
      <div className="p-5 border-b border-border">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Coach omgeving</p>
        <h2 className="text-xl font-black text-foreground mt-1">Bodyrebuild</h2>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {trainerItems.map(({ href, label, icon: Icon, needsClient }) => {
          const isActive = location === href || location.startsWith(`${href}/`);
          const disabled = needsClient && !activeClientId;
          const target = disabled ? "/trainer" : href;

          return (
            <Link
              key={href}
              href={target}
              className={`
                flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors
                ${isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}
                ${disabled ? "opacity-45" : ""}
              `}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border space-y-2">
        <div className="rounded-lg bg-muted/60 px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {activeClientId ? "Klant geselecteerd" : "Geen klant geselecteerd"}
          </p>
          <p className="text-sm font-bold text-foreground truncate">
            {activeClientId ? "Klanttraject actief" : "Kies een klant"}
          </p>
        </div>
        <Button variant="ghost" onClick={logout} className="w-full justify-start font-bold text-muted-foreground">
          <LogOut className="h-4 w-4 mr-2" />
          Uitloggen
        </Button>
      </div>
    </aside>
  );
}
