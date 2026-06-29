import { supabase } from "@/integrations/supabase/client";

export interface AddressOption {
  id: string; // master_addresses uuid OR "site:<uuid>"
  name: string;
  full_address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  gst_number: string | null;
  source: "manual" | "site";
}

/** Builds a single multi-line address snapshot (without the GST line). */
export function formatAddressSnapshot(a: AddressOption): string {
  const loc = [a.city, a.state, a.pincode].filter(Boolean).join(", ");
  return [a.name, a.full_address || "", loc].filter(Boolean).join("\n");
}

/** Fetch active addresses from the Address Book plus active project sites. */
export async function fetchAddressOptions(): Promise<AddressOption[]> {
  const [{ data: addrs }, { data: sites }] = await Promise.all([
    supabase
      .from("master_addresses")
      .select("id, address_name, full_address, city, state, pincode, gst_number")
      .eq("is_active", true)
      .order("address_name"),
    supabase
      .from("project_sites")
      .select("id, site_name, description")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("site_name"),
  ]);

  const manual: AddressOption[] = ((addrs || []) as any[]).map((r) => ({
    id: r.id,
    name: r.address_name,
    full_address: r.full_address,
    city: r.city,
    state: r.state,
    pincode: r.pincode,
    gst_number: r.gst_number,
    source: "manual",
  }));

  const siteOpts: AddressOption[] = ((sites || []) as any[]).map((s) => ({
    id: `site:${s.id}`,
    name: s.site_name,
    full_address: s.description || null,
    city: null,
    state: null,
    pincode: null,
    gst_number: null,
    source: "site",
  }));

  return [...manual, ...siteOpts];
}
