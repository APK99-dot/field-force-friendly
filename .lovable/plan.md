

## Plan: Approval Workflow Notifications for Leave & Regularisation

### 1. Database Migration

Create `notifications` table and `send_notification` RPC function (matching staging schema):

```sql
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  related_table TEXT,
  related_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users see/update own notifications
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
-- Authenticated users can insert (needed for submitting requests that notify managers)
CREATE POLICY "Authenticated can insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
```

Create `send_notification` SECURITY DEFINER function:

```sql
CREATE OR REPLACE FUNCTION public.send_notification(
  user_id_param UUID, title_param TEXT, message_param TEXT,
  type_param TEXT DEFAULT 'info', related_table_param TEXT DEFAULT NULL,
  related_id_param UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$ ... INSERT INTO notifications ... RETURNING id $$;
```

### 2. Create `useNotifications` Hook (`src/hooks/useNotifications.ts`)

Replicate staging hook exactly:
- Fetch unread notifications for current user
- Real-time subscription via Supabase channel on `notifications` table filtered by `user_id`
- `markAsRead(id)` and `markAllAsRead()` functions
- Return `{ notifications, unreadCount, isLoading, markAsRead, markAllAsRead }`

### 3. Create `NotificationBell` Component (`src/components/NotificationBell.tsx`)

Replicate staging component:
- Bell icon with badge count
- Popover dropdown showing notification list with title, message, relative timestamp
- "Mark all read" button
- Click notification to mark as read

### 4. Update `AppHeader.tsx`

Replace the static bell button with the `<NotificationBell />` component.

### 5. Update `LeaveApplicationModal.tsx`

After successful leave insert:
- Look up current user's `reporting_manager_id` from `users` table
- If manager exists, insert notification for the manager:
  - Title: "Leave Application - {employee_name}"
  - Message: "{leave_type} from {from_date} to {to_date}"
  - type: "leave_request", related_table: "leave_applications", related_id: application id

### 6. Update `RegularizationRequestModal.tsx`

After successful regularization insert:
- Look up current user's `reporting_manager_id` from `users` table
- If manager exists, insert notification for the manager:
  - Title: "Regularisation Request - {employee_name}"
  - Message: "Date: {date}, Reason: {reason}"
  - type: "regularization_request", related_table: "regularization_requests", related_id: request id

### 7. Update `AttendanceManagement.tsx` (Admin approval page)

After approving/rejecting leave or regularisation:
- Insert notification for the employee:
  - Title: "Leave {Approved/Rejected}" or "Regularisation {Approved/Rejected}"
  - Message includes dates and rejection reason if applicable
  - type: "leave_decision" / "regularization_decision"

### Technical Details
- `users.reporting_manager_id` already exists and is used for hierarchy
- Realtime enabled so managers see notifications instantly
- `send_notification` RPC is SECURITY DEFINER to bypass RLS for cross-user inserts (used from admin actions)
- Direct inserts used from employee-side (INSERT policy allows authenticated)
- Leave balance updates already handled by existing approval logic

