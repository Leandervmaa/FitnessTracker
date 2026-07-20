import { Link, useLocation } from "wouter";
import { Dumbbell, UtensilsCrossed, User, BarChart2, MessageSquare } from "lucide-react";

const NAV_ITEMS = [
  { href: "/trainingen", icon: Dumbbell,        label: "Trainingen"    },
  { href: "/dagboek",    icon: UtensilsCrossed,  label: "Eten"          },
  { href: "/vergelijk",  icon: BarChart2,        label: "Vergelijken"   },
  { href: "/feedback",   icon: MessageSquare,    label: "Feedback"      },
  { href: "/instellen",  icon: User,             label: "Profiel"       },
];

export function BottomNav() {
  const [location] = useLocation();

  return (
    <nav
      className="
        fixed bottom-0 left-0 right-0 z-50
        bg-background/95 backdrop-blur-md
        border-t border-border
        safe-area-bottom
      "
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-stretch justify-around max-w-lg mx-auto h-16">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          // Mark active if the current path starts with this href
          // (but avoid "/" matching everything)
          const isActive = location === href || location.startsWith(href + "/");

          return (
            <Link
              key={href}
              href={href}
              className={`
                flex flex-col items-center justify-center gap-0.5 flex-1
                text-[10px] font-semibold tracking-wide transition-all
                select-none cursor-pointer
                ${isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
                }
              `}
            >
              <span
                className={`
                  relative flex items-center justify-center
                  h-8 w-8 rounded-xl transition-all duration-200
                  ${isActive ? "bg-primary/10 scale-110" : ""}
                `}
              >
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                {isActive && (
                  <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                )}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
