import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WeekProvider } from "@/components/week-context";
import { AuthProvider, useAuth } from "@/components/auth-context";
import { ClientProvider, useClient } from "@/components/client-context";
import { TrainerClientBar } from "@/components/trainer-client-bar";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import LoginPage from "@/pages/login";
import TrainerDashboard from "@/pages/trainer-dashboard";
import BibliotheekPage from "@/pages/bibliotheek";
import WeekplannerPage from "@/pages/weekplanner";
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

function Landing() {
  const { user } = useAuth();
  const { activeClientId } = useClient();

  if (user?.role === "trainer" && !activeClientId) {
    return <TrainerDashboard />;
  }

  return <Home />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/trainer" component={TrainerRoute} />
      <Route path="/bibliotheek" component={TrainerLibraryRoute} />
      <Route path="/weekplanner" component={TrainerPlannerRoute} />
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

function TrainerRoute() {
  const { user } = useAuth();
  if (user?.role !== "trainer") {
    return <Home />;
  }
  return <TrainerDashboard />;
}

function TrainerLibraryRoute() {
  const { user } = useAuth();
  if (user?.role !== "trainer") return <Home />;
  return <BibliotheekPage />;
}

function TrainerPlannerRoute() {
  const { user } = useAuth();
  if (user?.role !== "trainer") return <Home />;
  return <WeekplannerPage />;
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
        <AuthProvider>
          <AuthShell />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function AuthShell() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <ClientProvider>
      <WeekProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <RealtimeSyncBridge />
          <TrainerClientBar />
          <Router />
        </WouterRouter>
      </WeekProvider>
    </ClientProvider>
  );
}

export default App;
