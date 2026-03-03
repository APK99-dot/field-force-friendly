import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Shield, Pencil, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface SecurityProfile {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
}

interface Props {
  onSelectProfile: (profile: SecurityProfile) => void;
  selectedProfileId?: string;
}

export default function SecurityProfilesList({ onSelectProfile, selectedProfileId }: Props) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<SecurityProfile | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const profilesQuery = useQuery({
    queryKey: ["security-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_profiles")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data || []) as SecurityProfile[];
    },
  });

  const userCountsQuery = useQuery({
    queryKey: ["security-profile-user-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_security_profiles")
        .select("profile_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        if (row.profile_id) {
          counts[row.profile_id] = (counts[row.profile_id] || 0) + 1;
        }
      });
      return counts;
    },
  });

  const createProfile = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name required");
      const { error } = await supabase.from("security_profiles").insert({
        name: name.trim(),
        description: description.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security-profiles"] });
      toast.success("Profile created");
      setName("");
      setDescription("");
      setAddOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!editProfile || !name.trim()) throw new Error("Name required");
      const { error } = await supabase
        .from("security_profiles")
        .update({ name: name.trim(), description: description.trim() || null })
        .eq("id", editProfile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security-profiles"] });
      toast.success("Profile updated");
      setEditProfile(null);
      setName("");
      setDescription("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteProfile = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("security_profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security-profiles"] });
      toast.success("Profile deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const profiles = profilesQuery.data || [];
  const userCounts = userCountsQuery.data || {};

  const openEdit = (p: SecurityProfile) => {
    setEditProfile(p);
    setName(p.name);
    setDescription(p.description || "");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Security Profiles</h2>
          <p className="text-sm text-muted-foreground">Define role-based access templates</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />New Profile</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Security Profile</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Profile Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Regional Manager" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the access level..." rows={3} />
              </div>
              <Button onClick={() => createProfile.mutate()} disabled={createProfile.isPending} className="w-full">
                {createProfile.isPending ? "Creating..." : "Create Profile"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {profiles.map((profile) => (
          <Card
            key={profile.id}
            className={`cursor-pointer transition-all hover:shadow-md ${selectedProfileId === profile.id ? "ring-2 ring-primary" : ""}`}
            onClick={() => onSelectProfile(profile)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm">{profile.name}</h3>
                      {profile.is_system && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">System</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{profile.description || "No description"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mr-2">
                    <Users className="h-3.5 w-3.5" />
                    <span>{userCounts[profile.id] || 0}</span>
                  </div>
                  {!profile.is_system && (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(profile); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); deleteProfile.mutate(profile.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editProfile} onOpenChange={(open) => { if (!open) setEditProfile(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Profile</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Profile Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <Button onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending} className="w-full">
              {updateProfile.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
