import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WeekProvider } from "@/components/week-context";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import TrainingList from "@/pages/trainingen/index";
import TrainingDetail from "@/pages/trainingen/detail";
import NutritionList from "@/pages/dagboek/index";
import FeedbackList from "@/pages/feedback/index";
import Instellen from "@/pages/instellen/index";
import ExcelViewer from "@/pages/excel-viewer";
import ProgressieFotos from "@/pages/progressie-fotos/index";
import Vergelijk from "@/pages/vergelijk/index";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Refetch on window/tab focus (user switches back to app)
      refetchOnWindowFocus: true,
      // Refetch when component remounts
      refetchOnMount: true,
      // Keep data fresh for 30 seconds, then mark stale
      staleTime: 30_000,
      // Retry failed requests twice before showing error
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/trainingen" component={TrainingList} />
      <Route path="/trainingen/:workoutId" component={TrainingDetail} />
      <Route path="/dagboek" component={NutritionList} />
      <Route path="/feedback" component={FeedbackList} />
      <Route path="/instellen" component={Instellen} />
      <Route path="/excel-viewer" component={ExcelViewer} />
      <Route path="/progressie-fotos" component={ProgressieFotos} />
      <Route path="/vergelijk" component={Vergelijk} />
      <Route component={NotFound} />
    </Switch>
  );
}

/** Activates SSE connection — must be inside QueryClientProvider */
function RealtimeSyncBridge() {
  useRealtimeSync();
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WeekProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <RealtimeSyncBridge />
            <Router />
          </WouterRouter>
        </WeekProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
