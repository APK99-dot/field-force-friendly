import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface DocRow {
  id: string;
  file_name: string;
  file_path: string;
  doc_type: string;
  created_at: string;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  id_proof: "ID Proof",
  address_proof: "Address Proof",
  other: "Other",
};

export default function Documents() {
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return setDocs([]);
      const { data, error } = await supabase
        .from("employee_documents")
        .select("id, file_name, file_path, doc_type, created_at")
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false });
      if (error) toast.error(error.message);
      setDocs((data as DocRow[]) ?? []);
    })();
  }, []);

  const open = async (doc: DocRow) => {
    setBusyId(doc.id);
    const { data, error } = await supabase.storage
      .from("employee-docs")
      .createSignedUrl(doc.file_path, 300);
    setBusyId(null);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Unable to open document");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 space-y-4 max-w-2xl mx-auto"
    >
      <div>
        <h1 className="text-xl font-bold">Documents</h1>
        <p className="text-sm text-muted-foreground">
          Documents uploaded to your employee record.
        </p>
      </div>

      {docs === null && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {docs?.length === 0 && (
        <Card className="shadow-card">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No documents on file yet. Your administrator can upload them to your
            profile.
          </CardContent>
        </Card>
      )}

      {docs && docs.length > 0 && (
        <Card className="shadow-card">
          <CardContent className="p-0 divide-y divide-border">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center gap-3 p-3.5">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{d.file_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className="text-[10px]">
                      {DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(d.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => open(d)}
                  disabled={busyId === d.id}
                  className="gap-1.5"
                >
                  {busyId === d.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  View
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
