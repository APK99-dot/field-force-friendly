import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Edit, Users, Download, Building2, Image as ImageIcon,
  Target, Activity as ActivityIcon, FileText, X, ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { getSiteAttachmentUrl } from "@/utils/siteAttachments";
import { useSiteHub } from "@/hooks/useSiteHub";
import SiteGallery from "@/components/admin/site-hub/SiteGallery";
import SiteMilestoneList from "@/components/admin/site-hub/SiteMilestoneList";
import SiteActivityList from "@/components/admin/site-hub/SiteActivityList";
import ActivityDetailsDialog from "@/components/activities/ActivityDetailsDialog";
import type { Activity } from "@/hooks/useActivities";

export interface HubSite {
  id: string;
  site_name: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
}

const STATUSES: { value: string; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "started", label: "Started" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

const STATUS_CHIP: Record<string, string> = {
  planned: "bg-info/15 text-info border-info/30",
  started: "bg-warning/15 text-warning border-warning/30",
  completed: "bg-success/15 text-success border-success/30",
  dropped: "bg-destructive/15 text-destructive border-destructive/30",
};

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

interface Props {
  site: HubSite | null;
  open: boolean;
  onClose: () => void;
  onEdit: (site: HubSite) => void;
  onStatusChanged?: () => void;
}

export default function SiteHubSheet({ site, open, onClose, onEdit, onStatusChanged }: Props) {
  const { loading, milestones, activities, assignedUsers, gallery, documents, attendanceByActivity } = useSiteHub(open ? site?.id ?? null : null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  const currentStatus = status ?? site?.status ?? "planned";

  const avgProgress = milestones.length
    ? Math.round(milestones.reduce((s, m) => s + (m.percent_complete || 0), 0) / milestones.length)
    : 0;

  const handleStatusChange = async (value: string) => {
    if (!site) return;
    setStatus(value);
    setSavingStatus(true);
    const { error } = await supabase
      .from("project_sites")
      .update({ status: value, is_active: value !== "dropped" })
      .eq("id", site.id);
    setSavingStatus(false);
    if (error) {
      toast.error("Could not update status");
      setStatus(site.status);
    } else {
      toast.success("Status updated");
      onStatusChanged?.();
    }
  };

  const openDoc = async (stored: string) => {
    const url = await getSiteAttachmentUrl(stored);
    if (url) window.open(url, "_blank");
    else toast.error("Could not open file");
  };

  const openActivityById = (id: string) => {
    const a = activities.find((x) => x.id === id);
    if (a) setSelectedActivity(a);
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) { setStatus(null); onClose(); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="p-0 gap-0 max-w-none w-screen h-[100dvh] sm:h-[92vh] sm:w-[94vw] sm:max-w-5xl sm:rounded-2xl flex flex-col overflow-hidden border-0 sm:border [&>button]:hidden"
        >
          {/* Hero header */}
          <div className="relative shrink-0 bg-gradient-primary text-primary-foreground px-4 sm:px-6 pt-5 pb-5 safe-top">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 sm:right-4 sm:top-4 rounded-full p-1.5 bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-start gap-3 pr-10">
              <div className="h-12 w-12 rounded-xl bg-primary-foreground/15 flex items-center justify-center shrink-0">
                <Building2 className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl sm:text-2xl font-bold truncate">{site?.site_name}</h2>
                <p className="text-xs sm:text-sm text-primary-foreground/70 mt-0.5">
                  {site?.start_date ? format(new Date(site.start_date), "dd MMM yyyy") : "—"}
                  {" – "}
                  {site?.end_date ? format(new Date(site.end_date), "dd MMM yyyy") : "Ongoing"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-4">
              <Select value={currentStatus} onValueChange={handleStatusChange} disabled={savingStatus}>
                <SelectTrigger className={`h-8 w-auto gap-1.5 rounded-full border text-xs font-semibold px-3 ${STATUS_CHIP[currentStatus] || ""} bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground`}>
                  {savingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  <SelectValue />
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="secondary"
                className="h-8 ml-auto"
                onClick={() => site && onEdit(site)}
              >
                <Edit className="h-3.5 w-3.5 mr-1" /> Edit Site
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
              <div className="px-3 sm:px-6 pt-3 border-b">
                <TabsList className="w-full justify-start overflow-x-auto bg-transparent p-0 h-auto gap-1">
                  {[
                    ["overview", "Overview"],
                    ["milestones", "Milestones"],
                    ["gallery", "Gallery"],
                    ["activities", "Activities"],
                    ["documents", "Docs"],
                  ].map(([v, l]) => (
                    <TabsTrigger
                      key={v}
                      value={v}
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 pb-2.5"
                    >
                      {l}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 safe-bottom">
                <TabsContent value="overview" className="mt-0 space-y-5 max-w-3xl">
                  {site?.description && (
                    <div className="rounded-xl border bg-muted/30 p-3.5">
                      <Label className="text-xs text-muted-foreground">Description</Label>
                      <p className="text-sm mt-1">{site.description}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border bg-card p-3.5 text-center shadow-card">
                      <Target className="h-5 w-5 mx-auto text-info mb-1.5" />
                      <p className="text-xl font-bold">{milestones.length}</p>
                      <p className="text-[11px] text-muted-foreground">Milestones</p>
                    </div>
                    <div className="rounded-xl border bg-card p-3.5 text-center shadow-card">
                      <ActivityIcon className="h-5 w-5 mx-auto text-warning mb-1.5" />
                      <p className="text-xl font-bold">{activities.length}</p>
                      <p className="text-[11px] text-muted-foreground">Activities</p>
                    </div>
                    <div className="rounded-xl border bg-card p-3.5 text-center shadow-card">
                      <ImageIcon className="h-5 w-5 mx-auto text-success mb-1.5" />
                      <p className="text-xl font-bold">{gallery.length}</p>
                      <p className="text-[11px] text-muted-foreground">Photos</p>
                    </div>
                  </div>
                  <div className="rounded-xl border bg-card p-4 shadow-card space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground font-medium">Overall progress</span>
                      <span className="font-bold">{avgProgress}%</span>
                    </div>
                    <Progress value={avgProgress} className="h-2.5" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-2.5">
                      <Users className="h-3.5 w-3.5" /> Assigned Users ({assignedUsers.length})
                    </Label>
                    {assignedUsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No users assigned</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {assignedUsers.map((u) => (
                          <div key={u.id} className="flex items-center gap-2.5 rounded-lg border bg-card p-2.5">
                            <Avatar className="h-8 w-8"><AvatarFallback className="text-[11px] bg-primary/10 text-primary">{initials(u.full_name)}</AvatarFallback></Avatar>
                            <span className="text-sm font-medium truncate">{u.full_name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="milestones" className="mt-0 max-w-3xl">
                  <SiteMilestoneList milestones={milestones} />
                </TabsContent>

                <TabsContent value="gallery" className="mt-0">
                  <SiteGallery gallery={gallery} onActivityClick={openActivityById} />
                </TabsContent>

                <TabsContent value="activities" className="mt-0 max-w-3xl">
                  <SiteActivityList activities={activities} onOpen={setSelectedActivity} />
                </TabsContent>

                <TabsContent value="documents" className="mt-0 max-w-3xl">
                  {documents.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No documents uploaded.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {documents.map((d, i) => (
                        <button key={i} type="button" onClick={() => openDoc(d.stored)}
                          className="flex items-center gap-2 text-sm text-primary hover:underline w-full text-left border rounded-lg px-3 py-2.5">
                          <FileText className="h-4 w-4 shrink-0" />
                          <span className="truncate flex-1">{d.name}</span>
                          <Download className="h-4 w-4 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <ActivityDetailsDialog
        activity={selectedActivity}
        open={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
        attendance={selectedActivity ? attendanceByActivity[selectedActivity.id] : null}
      />
    </>
  );
}
