import { supabase } from "@/integrations/supabase/client";

/**
 * Get all admin user IDs from user_roles table.
 */
export async function getAdminUserIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_roles" as any)
    .select("user_id")
    .eq("role", "admin");

  if (error) {
    console.error("Failed to fetch admin user IDs:", error);
    return [];
  }
  return (data || []).map((r: any) => r.user_id as string);
}

/**
 * Get notification recipients (manager + admins, deduped) for a given user.
 * Falls back to admins only if no manager is assigned.
 */
export async function getNotificationRecipients(
  userId: string
): Promise<string[]> {
  // Fetch manager
  const { data: userData } = await supabase
    .from("users")
    .select("reporting_manager_id, full_name")
    .eq("id", userId)
    .single();

  const managerId = userData?.reporting_manager_id || null;
  const adminIds = await getAdminUserIds();

  // Combine and dedupe, also exclude the user themselves
  const recipientSet = new Set<string>();
  if (managerId) recipientSet.add(managerId);
  adminIds.forEach((id) => recipientSet.add(id));
  recipientSet.delete(userId); // Don't notify yourself

  return Array.from(recipientSet);
}

/**
 * Send a notification to multiple recipients at once.
 */
export async function sendNotificationToMany(
  recipientIds: string[],
  notification: {
    title: string;
    message: string;
    type?: string;
    related_table?: string;
    related_id?: string;
  }
): Promise<void> {
  if (recipientIds.length === 0) return;

  const rows = recipientIds.map((uid) => ({
    user_id: uid,
    title: notification.title,
    message: notification.message,
    type: notification.type || "info",
    related_table: notification.related_table || null,
    related_id: notification.related_id || null,
  }));

  const { error } = await supabase.from("notifications").insert(rows);
  if (error) console.error("Failed to send notifications:", error);
}
