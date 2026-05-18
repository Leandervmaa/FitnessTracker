import { useWeek } from "@/components/week-context";
import { useListWeeks } from "@workspace/api-client-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

export function WeekSelector() {
  const { selectedWeek, setSelectedWeek } = useWeek();
  const { data: weeks } = useListWeeks();

  if (!weeks || !selectedWeek) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full border-border font-semibold h-9 px-3">
          Week {selectedWeek}
          <ChevronDown className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 max-h-72 overflow-y-auto">
        {weeks.map(week => (
          <DropdownMenuItem
            key={week.weekNumber}
            onClick={() => setSelectedWeek(week.weekNumber)}
            className={`font-medium flex justify-between ${week.weekNumber === selectedWeek ? "text-primary" : ""}`}
          >
            <span>Week {week.weekNumber}</span>
            {week.isComplete && <span className="text-primary text-xs">Klaar</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
