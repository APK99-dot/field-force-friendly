import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Attendance from "./pages/Attendance";
import Visits from "./pages/Visits";
import Expenses from "./pages/Expenses";
import More from "./pages/More";
import GPSTracking from "./pages/GPSTracking";
import AdminControls from "./pages/AdminControls";
import Projects from "./pages/Projects";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/visits" element={<Visits />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/more" element={<More />} />
            <Route path="/gps-tracking" element={<GPSTracking />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/admin-controls" element={<AdminControls />} />
            <Route path="/admin" element={<AdminControls />} />
            <Route path="/admin/*" element={<AdminControls />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
