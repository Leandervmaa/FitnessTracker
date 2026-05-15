import { Link } from "wouter";
import { useWeek } from "@/components/week-context";
import { useListWeeks } from "@workspace/api-client-react";
import { Dumbbell, Utensils, MessageSquare, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export default function Home() {
  const { selectedWeek, setSelectedWeek } = useWeek();
  const { data: weeks } = useListWeeks();

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center p-6 pb-24 max-w-md mx-auto relative">
      <div className="mt-8 mb-12 flex flex-col items-center">
        <div className="h-16 w-16 bg-primary rounded-full flex items-center justify-center mb-4 shadow-lg text-primary-foreground">
          <Dumbbell size={32} strokeWidth={2.5} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Mijn Fitness Tracker</h1>
      </div>

      <div className="w-full flex flex-col gap-4">
        <Link href="/trainingen" className="w-full">
          <div className="w-full bg-card border border-border rounded-xl p-6 flex items-center shadow-sm hover-elevate transition-all cursor-pointer">
            <div className="h-12 w-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center mr-4">
              <Dumbbell size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-card-foreground">Trainingen</h2>
              <p className="text-sm text-muted-foreground">Bekijk en log je workouts</p>
            </div>
          </div>
        </Link>

        <Link href="/voeding" className="w-full">
          <div className="w-full bg-card border border-border rounded-xl p-6 flex items-center shadow-sm hover-elevate transition-all cursor-pointer">
            <div className="h-12 w-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center mr-4">
              <Utensils size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-card-foreground">Voeding</h2>
              <p className="text-sm text-muted-foreground">Houd je macro's bij</p>
            </div>
          </div>
        </Link>

        <Link href="/feedback" className="w-full">
          <div className="w-full bg-card border border-border rounded-xl p-6 flex items-center shadow-sm hover-elevate transition-all cursor-pointer">
            <div className="h-12 w-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center mr-4">
              <MessageSquare size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-card-foreground">Feedback</h2>
              <p className="text-sm text-muted-foreground">Wekelijkse reflectie</p>
            </div>
          </div>
        </Link>
      </div>

      {weeks && selectedWeek && (
        <div className="fixed bottom-6 right-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="rounded-full shadow-md bg-card border-border h-12 px-4 font-semibold">
                Week {selectedWeek}
                <ChevronDown className="ml-2 h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {weeks.map(week => (
                <DropdownMenuItem 
                  key={week.weekNumber}
                  onClick={() => setSelectedWeek(week.weekNumber)}
                  className="font-medium flex justify-between"
                >
                  <span>Week {week.weekNumber}</span>
                  {week.isComplete && <span className="text-primary text-xs">Klaar</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
