import { Link, useLocation } from "wouter";
import { Dumbbell, UtensilsCrossed, User, BarChart2, MessageSquare } from "lucide-react";

const NAV_ITEMS = [
  { href: "/dagboek",    icon: UtensilsCrossed, label: "Eten"      },
  { href: "/feedback",   icon: MessageSquare,   label: "Feedback"  },
  { href: "/trainingen", icon: Dumbbell,        label: "Trainen",   main: true },
  { href: "/vergelijk",  icon: BarChart2,       label: "Vergelijk"  },
  { href: "/instellen",  icon: User,            label: "Profiel"    },
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
      <div className="flex items-stretch justify-around max-w-lg mx-auto h-20 px-1">
        {NAV_ITEMS.map(({ href, icon: Icon, label, main }) => {
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
                ${main ? "-mt-5" : ""}
                ${isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
                }
              `}
            >
              <span
                className={`
                  relative flex items-center justify-center
                  transition-all duration-200
                  ${main
                    ? "h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "h-8 w-8 rounded-xl"
                  }
                  ${isActive && !main ? "bg-primary/10 scale-110" : ""}
                  ${isActive && main ? "scale-105" : ""}
                `}
              >
                <Icon className={main ? "h-7 w-7" : "h-5 w-5"} strokeWidth={isActive ? 2.5 : 2} />
                {isActive && !main && (
                  <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                )}
              </span>
              <span className={main ? "text-[11px] font-black text-primary" : ""}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
