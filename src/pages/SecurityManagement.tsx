import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield, Grid3X3, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SecurityProfilesList from "@/components/security/SecurityProfilesList";
import RolePermissionsMatrix from "@/components/security/RolePermissionsMatrix";
import UserProfileAssignments from "@/components/security/UserProfileAssignments";

interface SelectedProfile {
  id: string;
  name: string;
}

export default function SecurityManagement() {
  const navigate = useNavigate();
  const [selectedProfile, setSelectedProfile] = useState<SelectedProfile | null>(null);
  const [activeTab, setActiveTab] = useState("profiles");

  const handleSelectProfile = (profile: { id: string; name: string }) => {
    setSelectedProfile(profile);
    setActiveTab("permissions");
  };

  return (
    <motion.div className="p-4 space-y-6 max-w-6xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin-controls")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Security & Access</h1>
          <p className="text-sm text-muted-foreground">Manage security profiles, permissions, and user assignments</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profiles" className="text-xs gap-1.5">
            <Shield className="h-3.5 w-3.5" />Profiles
          </TabsTrigger>
          <TabsTrigger value="permissions" className="text-xs gap-1.5">
            <Grid3X3 className="h-3.5 w-3.5" />Role Permissions
          </TabsTrigger>
          <TabsTrigger value="assignments" className="text-xs gap-1.5">
            <Users className="h-3.5 w-3.5" />User Assignments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profiles">
          <SecurityProfilesList
            onSelectProfile={handleSelectProfile}
            selectedProfileId={selectedProfile?.id}
          />
        </TabsContent>

        <TabsContent value="permissions">
          {selectedProfile ? (
            <RolePermissionsMatrix profileId={selectedProfile.id} profileName={selectedProfile.name} />
          ) : (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <Shield className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Select a security profile from the Profiles tab to manage its permissions</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setActiveTab("profiles")}>
                Go to Profiles
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="assignments">
          <UserProfileAssignments />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
