import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WeekProvider } from "@/components/week-context";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import TrainingList from "@/pages/trainingen/index";
import TrainingDetail from "@/pages/trainingen/detail";
import NutritionList from "@/pages/dagboek/index";
import FeedbackList from "@/pages/feedback/index";
import Instellen from "@/pages/instellen/index";
import ExcelViewer from "@/pages/excel-viewer";

const queryClient = new QueryClient();

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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WeekProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </WeekProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
