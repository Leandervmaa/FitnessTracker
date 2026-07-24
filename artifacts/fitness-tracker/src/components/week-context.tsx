import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/components/auth-context";
import { useClient } from "@/components/client-context";
import { apiFetch } from "@/lib/api";

type WeekContextType = {
  selectedWeek: number | null;
  setSelectedWeek: (week: number) => void;
};

type WeekSummary = {
  weekNumber: number;
};

const WeekContext = createContext<WeekContextType | null>(null);

export function WeekProvider({ children }: { children: ReactNode }) {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const { user } = useAuth();
  const { activeClientId } = useClient();
  const [location] = useLocation();
  const lastAutoKey = useRef("");
  const lastScopeKey = useRef("");

  const { data: weeks = [] } = useQuery<WeekSummary[]>({
    queryKey: ["weeks", user?.role, activeClientId],
    enabled: !!user && !!activeClientId,
    queryFn: async () => {
      const res = await apiFetch("/api/weeks");
      if (!res.ok) throw new Error("Weken ophalen mislukt");
      return res.json();
    },
  });

  const { data: currentWeek } = useQuery<WeekSummary>({
    queryKey: ["current-week", user?.role, activeClientId],
    enabled: !!user && !!activeClientId && user?.role !== "trainer",
    queryFn: async () => {
      const res = await apiFetch("/api/weeks/current");
      if (!res.ok) throw new Error("Huidige week ophalen mislukt");
      return res.json();
    },
  });

  const latestExistingWeek = useMemo(() => {
    const weekNumbers = weeks.map((week) => week.weekNumber).filter((weekNumber) => Number.isFinite(weekNumber));
    return weekNumbers.length > 0 ? Math.max(...weekNumbers) : null;
  }, [weeks]);

  const targetWeek = user?.role === "trainer"
    ? latestExistingWeek
    : currentWeek?.weekNumber ?? latestExistingWeek;

  useEffect(() => {
    const scopeKey = `${user?.role ?? "none"}:${activeClientId ?? "none"}`;
    if (lastScopeKey.current === scopeKey) return;

    lastScopeKey.current = scopeKey;
    lastAutoKey.current = "";
    setSelectedWeek(null);
  }, [activeClientId, user?.role]);

  useEffect(() => {
    if (!targetWeek) return;

    const autoKey = `${user?.role ?? "none"}:${activeClientId ?? "none"}:${location}:${targetWeek}`;
    if (lastAutoKey.current === autoKey) return;

    lastAutoKey.current = autoKey;
    if (selectedWeek !== targetWeek) {
      setSelectedWeek(targetWeek);
    }
  }, [activeClientId, location, selectedWeek, targetWeek, user?.role]);

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
