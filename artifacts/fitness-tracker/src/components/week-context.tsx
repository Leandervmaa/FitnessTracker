import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { useGetCurrentWeek } from "@workspace/api-client-react";

type WeekContextType = {
  selectedWeek: number | null;
  setSelectedWeek: (week: number) => void;
};

const WeekContext = createContext<WeekContextType | null>(null);

export function WeekProvider({ children }: { children: ReactNode }) {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const { data: currentWeek } = useGetCurrentWeek();

  useEffect(() => {
    if (currentWeek && !selectedWeek) {
      setSelectedWeek(currentWeek.weekNumber);
    }
  }, [currentWeek, selectedWeek]);

  return (
    <WeekContext.Provider value={{ selectedWeek, setSelectedWeek }}>
      {children}
    </WeekContext.Provider>
  );
}

export function useWeek() {
  const context = useContext(WeekContext);
  if (!context) {
    throw new Error("useWeek must be used within a WeekProvider");
  }
  return context;
}
