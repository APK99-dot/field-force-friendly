import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Loader2, Edit, Users, Paperclip, Download, Building2, Image as ImageIcon,
  Target, Activity as ActivityIcon, FileText,
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

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  planned: "secondary",
  started: "default",
  completed: "default",
  dropped: "destructive",
};
const STATUS_LABEL: Record<string, string> = {
  planned: "Planned", started: "Started", completed: "Completed", dropped: "Dropped",
};

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

interface Props {
  site: HubSite | null;
  open: boolean;
  onClose: () => void;
  onEdit: (site: HubSite) => void;
}

export default function SiteHubSheet({ site, open, onClose, onEdit }: Props) {
  const { loading, milestones, activities, assignedUsers, gallery, documents, attendanceByActivity } = useSiteHub(open ? site?.id ?? null : null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);

  const avgProgress = milestones.length
    ? Math.round(milestones.reduce((s, m) => s + (m.percent_complete || 0), 0) / milestones.length)
    : 0;

  const openDoc = async (stored: string) => {
    const url = await getSiteAttachmentUrl(stored);
    if (url) window.open(url, "_blank");
    else toast.error("Could not open file");
  };

  const openActivityById = (id: string) => {
    const a = activities.find((x) => x.id === id);
    if (a) setSelectedActivity(a);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent className="w-full sm:max-w-xl lg:max-w-2xl p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 border-b space-y-2">
            <div className="flex items-start justify-between gap-2 pr-8">
              <SheetTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5 text-primary shrink-0" />
                <span className="truncate">{site?.site_name}</span>
              </SheetTitle>
            </div>
            <div className="flex items-center gap-2">
              {site && (
                <Badge variant={STATUS_VARIANT[site.status] || "secondary"}>
                  {STATUS_LABEL[site.status] || "Planned"}
                </Badge>
              )}
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => site && onEdit(site)}>
                <Edit className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
            </div>
          </SheetHeader>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
              <div className="px-4 pt-3">
                <TabsList className="w-full justify-start overflow-x-auto">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="milestones">Milestones</TabsTrigger>
                  <TabsTrigger value="gallery">Gallery</TabsTrigger>
                  <TabsTrigger value="activities">Activities</TabsTrigger>
                  <TabsTrigger value="documents">Docs</TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4">
                <TabsContent value="overview" className="mt-0 space-y-5">
                  {site?.description && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Description</Label>
                      <p className="text-sm">{site.description}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border p-3 text-center">
                      <Target className="h-4 w-4 mx-auto text-primary mb-1" />
                      <p className="text-lg font-semibold">{milestones.length}</p>
                      <p className="text-[11px] text-muted-foreground">Milestones</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <ActivityIcon className="h-4 w-4 mx-auto text-primary mb-1" />
                      <p className="text-lg font-semibold">{activities.length}</p>
                      <p className="text-[11px] text-muted-foreground">Activities</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <ImageIcon className="h-4 w-4 mx-auto text-primary mb-1" />
                      <p className="text-lg font-semibold">{gallery.length}</p>
                      <p className="text-[11px] text-muted-foreground">Photos</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Overall progress</span>
                      <span className="font-medium">{avgProgress}%</span>
                    </div>
                    <Progress value={avgProgress} className="h-2" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Start Date</Label>
                      <p className="text-sm">{site?.start_date ? format(new Date(site.start_date), "dd MMM yyyy") : "—"}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">End Date</Label>
                      <p className="text-sm">{site?.end_date ? format(new Date(site.end_date), "dd MMM yyyy") : "Ongoing"}</p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-2">
                      <Users className="h-3.5 w-3.5" /> Assigned Users ({assignedUsers.length})
                    </Label>
                    {assignedUsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No users assigned</p>
                    ) : (
                      <div className="space-y-1.5">
                        {assignedUsers.map((u) => (
                          <div key={u.id} className="flex items-center gap-2">
                            <Avatar className="h-6 w-6"><AvatarFallback className="text-[10px] bg-muted">{initials(u.full_name)}</AvatarFallback></Avatar>
                            <span className="text-sm">{u.full_name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="milestones" className="mt-0">
                  <SiteMilestoneList milestones={milestones} />
                </TabsContent>

                <TabsContent value="gallery" className="mt-0">
                  <SiteGallery gallery={gallery} onActivityClick={openActivityById} />
                </TabsContent>

                <TabsContent value="activities" className="mt-0">
                  <SiteActivityList activities={activities} onOpen={setSelectedActivity} />
                </TabsContent>

                <TabsContent value="documents" className="mt-0">
                  {documents.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No documents uploaded.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {documents.map((d, i) => (
                        <button key={i} type="button" onClick={() => openDoc(d.stored)}
                          className="flex items-center gap-2 text-sm text-primary hover:underline w-full text-left border rounded-lg px-3 py-2">
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate flex-1">{d.name}</span>
                          <Download className="h-3.5 w-3.5 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>

      <ActivityDetailsDialog
        activity={selectedActivity}
        open={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
        attendance={selectedActivity ? attendanceByActivity[selectedActivity.id] : null}
      />
    </>
  );
}
