import { lazy, Suspense } from "react";
import { lazyWithRetry } from "@/utils/lazyWithRetry";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import Auth from "./pages/Auth";

// Lazy-load all route pages for faster initial load
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"));
const Attendance = lazyWithRetry(() => import("./pages/Attendance"));
const Visits = lazyWithRetry(() => import("./pages/Visits"));
const Expenses = lazyWithRetry(() => import("./pages/Expenses"));
const More = lazyWithRetry(() => import("./pages/More"));
const GPSTracking = lazyWithRetry(() => import("./pages/GPSTracking"));
const AdminControls = lazyWithRetry(() => import("./pages/AdminControls"));
const AdminUserManagement = lazyWithRetry(() => import("./pages/AdminUserManagement"));
const AttendanceManagement = lazyWithRetry(() => import("./pages/AttendanceManagement"));
const AdminExpenseManagement = lazyWithRetry(() => import("./pages/AdminExpenseManagement"));
const SecurityManagement = lazyWithRetry(() => import("./pages/SecurityManagement"));
const NotificationRulesAdmin = lazyWithRetry(() => import("./pages/admin/NotificationRulesAdmin"));
const CompanyProfile = lazyWithRetry(() => import("./pages/CompanyProfile"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const ProjectsPage = lazyWithRetry(() => import("./pages/Projects"));
const ProjectDetailPage = lazyWithRetry(() => import("./pages/ProjectDetail"));
const TemplatesPage = lazyWithRetry(() => import("./pages/Templates"));
const PendingApprovals = lazyWithRetry(() => import("./pages/PendingApprovals"));
const Activities = lazyWithRetry(() => import("./pages/Activities"));
const ActivityTimeline = lazyWithRetry(() => import("./pages/ActivityTimeline"));
const SiteMasterPage = lazyWithRetry(() => import("./pages/SiteMaster"));
const ActivityTypeMasterPage = lazyWithRetry(() => import("./pages/ActivityTypeMaster"));
const InstallApp = lazyWithRetry(() => import("./pages/InstallApp"));
const VendorQuote = lazyWithRetry(() => import("./pages/VendorQuote"));
const OAuthConsent = lazyWithRetry(() => import("./pages/OAuthConsent"));
const Profile = lazyWithRetry(() => import("./pages/Profile"));
const AppSettings = lazyWithRetry(() => import("./pages/AppSettings"));
const Documents = lazyWithRetry(() => import("./pages/Documents"));
const Help = lazyWithRetry(() => import("./pages/Help"));
const MyTeam = lazyWithRetry(() => import("./pages/MyTeam"));
const Vendors = lazyWithRetry(() => import("./pages/Vendors"));
const VendorDetail = lazyWithRetry(() => import("./pages/VendorDetail"));
const MasterData = lazyWithRetry(() => import("./pages/MasterData"));
const CategoryMaster = lazyWithRetry(() => import("./pages/master/CategoryMaster"));
const ProductMaster = lazyWithRetry(() => import("./pages/master/ProductMaster"));
const AddressBook = lazyWithRetry(() => import("./pages/master/AddressBook"));
const UomMaster = lazyWithRetry(() => import("./pages/master/UomMaster"));
const LeadSourcesMaster = lazyWithRetry(() => import("./pages/master/LeadSourcesMaster"));
const LeadStatusesMaster = lazyWithRetry(() => import("./pages/master/LeadStatusesMaster"));
const EventTypesMaster = lazyWithRetry(() => import("./pages/master/EventTypesMaster"));
const OpportunityStagesMaster = lazyWithRetry(() => import("./pages/master/OpportunityStagesMaster"));
const OpportunityTypesMaster = lazyWithRetry(() => import("./pages/master/OpportunityTypesMaster"));
const LeadScoringMaster = lazyWithRetry(() => import("./pages/master/LeadScoringMaster"));
const OpportunityScoringMaster = lazyWithRetry(() => import("./pages/master/OpportunityScoringMaster"));
const Customers = lazyWithRetry(() => import("./pages/Customers"));
const CustomerDetail = lazyWithRetry(() => import("./pages/CustomerDetail"));
const Leads = lazyWithRetry(() => import("./pages/Leads"));
const LeadDetail = lazyWithRetry(() => import("./pages/LeadDetail"));
const Events = lazyWithRetry(() => import("./pages/Events"));
const EventDetail = lazyWithRetry(() => import("./pages/EventDetail"));
const Opportunities = lazyWithRetry(() => import("./pages/Opportunities"));
const OpportunityDetail = lazyWithRetry(() => import("./pages/OpportunityDetail"));

const Procurement = lazyWithRetry(() => import("./pages/Procurement"));
const GRN = lazyWithRetry(() => import("./pages/GRN"));
const Analytics = lazyWithRetry(() => import("./pages/Analytics"));
const MyReports = lazyWithRetry(() => import("./pages/MyReports"));
const ConfigurationWorkflow = lazyWithRetry(() => import("./pages/ConfigurationWorkflow"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/.lovable/oauth/consent" element={<Suspense fallback={<PageFallback />}><OAuthConsent /></Suspense>} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
            <Route path="/attendance" element={<Suspense fallback={<PageFallback />}><Attendance /></Suspense>} />
            <Route path="/visits" element={<Suspense fallback={<PageFallback />}><Visits /></Suspense>} />
            <Route path="/expenses" element={<Suspense fallback={<PageFallback />}><Expenses /></Suspense>} />
            <Route path="/more" element={<Suspense fallback={<PageFallback />}><More /></Suspense>} />
            <Route path="/gps-tracking" element={<Suspense fallback={<PageFallback />}><GPSTracking /></Suspense>} />
            <Route path="/admin-controls" element={<Suspense fallback={<PageFallback />}><AdminControls /></Suspense>} />
            <Route path="/admin" element={<Suspense fallback={<PageFallback />}><AdminControls /></Suspense>} />
            <Route path="/admin/users" element={<Suspense fallback={<PageFallback />}><AdminUserManagement /></Suspense>} />
            <Route path="/admin/attendance" element={<Suspense fallback={<PageFallback />}><AttendanceManagement /></Suspense>} />
            <Route path="/admin/expenses" element={<Suspense fallback={<PageFallback />}><AdminExpenseManagement /></Suspense>} />
            <Route path="/admin/security" element={<Suspense fallback={<PageFallback />}><SecurityManagement /></Suspense>} />
            <Route path="/admin/notifications" element={<Suspense fallback={<PageFallback />}><NotificationRulesAdmin /></Suspense>} />
            <Route path="/admin/company" element={<Suspense fallback={<PageFallback />}><CompanyProfile /></Suspense>} />
            <Route path="/admin/configuration" element={<Suspense fallback={<PageFallback />}><ConfigurationWorkflow /></Suspense>} />
            <Route path="/admin/sites" element={<Navigate to="/sites" replace />} />
            <Route path="/sites" element={<Suspense fallback={<PageFallback />}><SiteMasterPage /></Suspense>} />
            <Route path="/activity-types" element={<Suspense fallback={<PageFallback />}><ActivityTypeMasterPage /></Suspense>} />
            <Route path="/admin/activity-types" element={<Navigate to="/activity-types" replace />} />
            <Route path="/projects" element={<Suspense fallback={<PageFallback />}><ProjectsPage /></Suspense>} />
            <Route path="/projects/:id" element={<Suspense fallback={<PageFallback />}><ProjectDetailPage /></Suspense>} />
            <Route path="/templates" element={<Suspense fallback={<PageFallback />}><TemplatesPage /></Suspense>} />
            <Route path="/templates/:id" element={<Suspense fallback={<PageFallback />}><TemplatesPage /></Suspense>} />
            <Route path="/pending-approvals" element={<Suspense fallback={<PageFallback />}><PendingApprovals /></Suspense>} />
            <Route path="/activities" element={<Suspense fallback={<PageFallback />}><Activities /></Suspense>} />
            <Route path="/activity-timeline" element={<Suspense fallback={<PageFallback />}><ActivityTimeline /></Suspense>} />
            <Route path="/profile" element={<Suspense fallback={<PageFallback />}><Profile /></Suspense>} />
            <Route path="/settings" element={<Suspense fallback={<PageFallback />}><AppSettings /></Suspense>} />
            <Route path="/documents" element={<Suspense fallback={<PageFallback />}><Documents /></Suspense>} />
            <Route path="/help" element={<Suspense fallback={<PageFallback />}><Help /></Suspense>} />
            <Route path="/my-team" element={<Suspense fallback={<PageFallback />}><MyTeam /></Suspense>} />
            <Route path="/vendors" element={<Suspense fallback={<PageFallback />}><Vendors /></Suspense>} />
            <Route path="/vendors/:id" element={<Suspense fallback={<PageFallback />}><VendorDetail /></Suspense>} />
            <Route path="/master-data" element={<Suspense fallback={<PageFallback />}><MasterData /></Suspense>} />
            <Route path="/master-data/categories" element={<Suspense fallback={<PageFallback />}><CategoryMaster /></Suspense>} />
            <Route path="/master-data/products" element={<Suspense fallback={<PageFallback />}><ProductMaster /></Suspense>} />
            <Route path="/master-data/addresses" element={<Suspense fallback={<PageFallback />}><AddressBook /></Suspense>} />
            <Route path="/master-data/uom" element={<Suspense fallback={<PageFallback />}><UomMaster /></Suspense>} />
            <Route path="/master-data/lead-sources" element={<Suspense fallback={<PageFallback />}><LeadSourcesMaster /></Suspense>} />
            <Route path="/master-data/lead-statuses" element={<Suspense fallback={<PageFallback />}><LeadStatusesMaster /></Suspense>} />
            <Route path="/master-data/event-types" element={<Suspense fallback={<PageFallback />}><EventTypesMaster /></Suspense>} />
            <Route path="/master-data/opportunity-stages" element={<Suspense fallback={<PageFallback />}><OpportunityStagesMaster /></Suspense>} />
            <Route path="/master-data/opportunity-types" element={<Suspense fallback={<PageFallback />}><OpportunityTypesMaster /></Suspense>} />
            <Route path="/master-data/lead-scoring" element={<Suspense fallback={<PageFallback />}><LeadScoringMaster /></Suspense>} />
            <Route path="/master-data/opportunity-scoring" element={<Suspense fallback={<PageFallback />}><OpportunityScoringMaster /></Suspense>} />
            <Route path="/customers" element={<Suspense fallback={<PageFallback />}><Customers /></Suspense>} />
            <Route path="/customers/:id" element={<Suspense fallback={<PageFallback />}><CustomerDetail /></Suspense>} />
            <Route path="/leads" element={<Suspense fallback={<PageFallback />}><Leads /></Suspense>} />
            <Route path="/leads/:id" element={<Suspense fallback={<PageFallback />}><LeadDetail /></Suspense>} />
            <Route path="/events" element={<Suspense fallback={<PageFallback />}><Events /></Suspense>} />
            <Route path="/events/:id" element={<Suspense fallback={<PageFallback />}><EventDetail /></Suspense>} />
            <Route path="/opportunities" element={<Suspense fallback={<PageFallback />}><Opportunities /></Suspense>} />
            <Route path="/opportunities/:id" element={<Suspense fallback={<PageFallback />}><OpportunityDetail /></Suspense>} />
            
            
            <Route path="/procurement" element={<Suspense fallback={<PageFallback />}><Procurement /></Suspense>} />
            <Route path="/grn" element={<Suspense fallback={<PageFallback />}><GRN /></Suspense>} />
            <Route path="/reports" element={<Suspense fallback={<PageFallback />}><Analytics /></Suspense>} />
            {/* Delivered scheduled reports for the signed-in recipient. NOT /reports —
                that path is already the Analytics page and stealing it would also
                break the /analytics and /reports/:type redirects below. */}
            <Route path="/my-reports" element={<Suspense fallback={<PageFallback />}><MyReports /></Suspense>} />
            <Route path="/reports/:type" element={<Navigate to="/reports" replace />} />
            <Route path="/analytics" element={<Navigate to="/reports" replace />} />
          </Route>
          <Route path="/install" element={<Suspense fallback={<PageFallback />}><InstallApp /></Suspense>} />
          <Route path="/vendor-quote/:token" element={<Suspense fallback={<PageFallback />}><VendorQuote /></Suspense>} />
          <Route path="*" element={<Suspense fallback={<PageFallback />}><NotFound /></Suspense>} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
