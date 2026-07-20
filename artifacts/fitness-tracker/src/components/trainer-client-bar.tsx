import { Link, useLocation } from "wouter";
import { ArrowLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-context";
import { useClient } from "@/components/client-context";

export function TrainerClientBar() {
  const { user } = useAuth();
  const { activeClientId, setActiveClientId } = useClient();
  const [, setLocation] = useLocation();

  if (user?.role !== "trainer" || !activeClientId) return null;

  return (
    <div className="w-full bg-primary text-primary-foreground">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2 text-sm">
        <Users className="h-4 w-4" />
        <span className="flex-1 font-semibold truncate">Trainer bekijkt klanttraject</span>
        <Button
          size="sm"
          variant="secondary"
          className="h-8 px-3 font-bold"
          onClick={() => {
            setActiveClientId(null);
            setLocation("/trainer");
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          Menu
        </Button>
      </div>
    </div>
  );
}
