import { useState } from "react";
import { toast } from "sonner";
import { resolveVendorQuoteAttachmentUrl } from "@/utils/vendorQuoteAttachments";

interface Props {
  url: string;
  name?: string | null;
  index: number;
  className?: string;
}

/**
 * Opens a vendor quote attachment through a signed URL. The bucket is private,
 * so a stored URL can no longer be linked to directly.
 */
export function VendorQuoteAttachmentLink({ url, name, index, className }: Props) {
  const [loading, setLoading] = useState(false);

  const open = async () => {
    setLoading(true);
    try {
      const signed = await resolveVendorQuoteAttachmentUrl(url);
      if (!signed) throw new Error("Could not open attachment");
      window.open(signed, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message || "Could not open attachment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      className={className || "text-primary underline hover:opacity-80 break-all text-left"}
    >
      {name || `Attachment ${index + 1}`}
ایسے    </button>
  );
}
