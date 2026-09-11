-- Purchase-order status changes as a first-class, queryable table.
--
-- WHY A NEW TABLE RATHER THAN procurement_orders.stage_history
--
-- stage_history is the timeline the PO detail drawer renders, and it is written
-- by exactly two code paths: ProcurementDetail.changeStatus() and
-- submit-vendor-quote. Four other paths move a PO's status WITHOUT appending to
-- it:
--     src/components/procurement/GRNForm.tsx:242
--     src/components/activities/CreativeActivityForm.tsx:657
--     src/components/procurement/listviews/ListViewTable.tsx:105
--     supabase/functions/import-salesforce-procurement/index.ts:394
-- An end-of-day digest built from stage_history would therefore silently drop
-- every goods-receipt and inline-edit move. A trigger on the column cannot be
-- bypassed by any of them, which is what "each status change" has to mean.
--
-- The second reason is shape: stage_history records only the status moved TO.
-- A digest wants from -> to on one line, which needs either a window function
-- over a jsonb array per row or a column that already holds it. This holds it.
--
-- The notification trigger in 20260805100000 is left alone. It fires the
-- per-change notifications that already exist; this table is the record the
-- daily report reads. They are independent, so switching the individual
-- notifications off later does not affect the report.

-- 1. Table ---------------------------------------------------------------------
-- Denormalised on purpose: po_number, site_id and vendor_id are copied in at
-- write time so a change is still readable after the PO is edited, and so the
-- report needs no join back to a mutable row.
CREATE TABLE IF NOT EXISTS public.procurement_status_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           uuid NOT NULL REFERENCES public.procurement_orders(id) ON DELETE CASCADE,
  po_number          text,
  requisition_number text,
  site_id            uuid,
  vendor_id          uuid,
  -- NULL means the PO was created at this status rather than moved to it.
  from_status        text,
  to_status          text NOT NULL,
  changed_by         uuid,
  changed_by_name    text,
  changed_at         timestamptz NOT NULL DEFAULT now(),
  note               text,
  is_auto            boolean NOT NULL DEFAULT false,
  -- 'trigger' for live changes, 'backfill' for rows reconstructed from
  -- stage_history when this migration ran.
  event_source       text NOT NULL DEFAULT 'trigger',
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Makes both the trigger insert and the backfill re-runnable. A genuine second
-- move of the same PO into the same status at the same microsecond does not
-- happen; a migration being applied twice does.
CREATE UNIQUE INDEX IF NOT EXISTS uq_procurement_status_events_change
  ON public.procurement_status_events (order_id, to_status, changed_at);

-- The report's only access path: a date window, newest first.
CREATE INDEX IF NOT EXISTS idx_procurement_status_events_changed_at
  ON public.procurement_status_events (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_procurement_status_events_order
  ON public.procurement_status_events (order_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_procurement_status_events_site
  ON public.procurement_status_events (site_id);

-- 2. RLS -----------------------------------------------------------------------
-- get_procurement_status_changes_report() is SECURITY DEFINER and does its own
-- site scoping, so these policies govern direct reads from the client only.
-- Same shape as report_delivery_log in 20260730120000.
ALTER TABLE public.procurement_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read all PO status events" ON public.procurement_status_events;
CREATE POLICY "Admins can read all PO status events"
  ON public.procurement_status_events FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can read PO status events on their sites" ON public.procurement_status_events;
CREATE POLICY "Users can read PO status events on their sites"
  ON public.procurement_status_events FOR SELECT
  TO authenticated USING (
    site_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.site_assignments sa
      WHERE sa.site_id = public.procurement_status_events.site_id
        AND sa.user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policy for anyone. The table is written only by the
-- SECURITY DEFINER trigger below; it is an append-only audit log.

-- 3. Trigger -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_procurement_status_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_from       text;
  v_last       jsonb;
  v_actor      uuid;
  v_actor_name text;
  v_note       text;
  v_auto       boolean := false;
BEGIN
  -- AFTER UPDATE OF status still fires when status appears in the SET list with
  -- an unchanged value, which the PO list view's patch does on every inline edit.
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_from := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END;

  -- changeStatus() appends to stage_history in the SAME statement that moves the
  -- status, so when the last entry names the new status it is this change, and it
  -- carries the best attribution available: who moved it, what they typed, and
  -- whether the app advanced the stage automatically.
  IF jsonb_typeof(NEW.stage_history) = 'array'
     AND jsonb_array_length(NEW.stage_history) > 0 THEN
    v_last := NEW.stage_history -> (jsonb_array_length(NEW.stage_history) - 1);
    IF v_last ->> 'status' IS NOT DISTINCT FROM NEW.status THEN
      IF v_last ->> 'moved_by' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_actor := (v_last ->> 'moved_by')::uuid;
      END IF;
      v_actor_name := NULLIF(v_last ->> 'moved_by_name', '');
      v_note       := NULLIF(v_last ->> 'note', '');
      v_auto       := COALESCE((v_last ->> 'auto')::boolean, false);
    END IF;
  END IF;

  -- The GRN form, the activity form and the list-view inline editor move a PO
  -- without writing stage_history, so auth.uid() is the fallback. A service-role
  -- caller (the Salesforce import) has no auth.uid() and lands on created_by.
  v_actor := COALESCE(v_actor, auth.uid(), NEW.created_by);

  IF v_actor_name IS NULL AND v_actor IS NOT NULL THEN
    SELECT COALESCE(NULLIF(p.full_name, ''), NULLIF(p.username, ''))
      INTO v_actor_name
    FROM public.profiles p
    WHERE p.id = v_actor;
  END IF;

  INSERT INTO public.procurement_status_events (
    order_id, po_number, requisition_number, site_id, vendor_id,
    from_status, to_status, changed_by, changed_by_name, changed_at,
    note, is_auto, event_source
  )
  VALUES (
    NEW.id, NEW.po_number, NEW.requisition_number, NEW.site_id, NEW.vendor_id,
    v_from, COALESCE(NEW.status, 'Unknown'), v_actor,
    COALESCE(v_actor_name, 'System'), now(),
    v_note, v_auto, 'trigger'
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_log_procurement_status_event ON public.procurement_orders;
CREATE TRIGGER trg_log_procurement_status_event
  AFTER INSERT OR UPDATE OF status ON public.procurement_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_procurement_status_event();

-- 4. Backfill ------------------------------------------------------------------
-- Reconstructs history from stage_history so the first report is not empty and
-- the PO detail timeline and the report agree on everything recorded so far.
-- Orders whose stage_history is missing or malformed contribute one synthetic
-- creation row instead; a per-order exception block keeps one bad jsonb blob
-- from aborting the migration.
DO $backfill$
DECLARE
  v_order RECORD;
BEGIN
  FOR v_order IN
    SELECT id, po_number, requisition_number, site_id, vendor_id,
           status, created_at, created_by, stage_history
    FROM public.procurement_orders
  LOOP
    BEGIN
      IF jsonb_typeof(v_order.stage_history) = 'array'
         AND jsonb_array_length(v_order.stage_history) > 0 THEN

        INSERT INTO public.procurement_status_events (
          order_id, po_number, requisition_number, site_id, vendor_id,
          from_status, to_status, changed_by, changed_by_name, changed_at,
          note, is_auto, event_source
        )
        SELECT
          v_order.id, v_order.po_number, v_order.requisition_number,
          v_order.site_id, v_order.vendor_id,
          t.from_status, t.to_status, t.changed_by,
          COALESCE(t.changed_by_name, 'System'), t.changed_at,
          t.note, t.is_auto, 'backfill'
        FROM (
          SELECT
            e.entry ->> 'status' AS to_status,
            LAG(e.entry ->> 'status') OVER (ORDER BY e.ord) AS from_status,
            CASE
              WHEN e.entry ->> 'moved_by' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN (e.entry ->> 'moved_by')::uuid
            END AS changed_by,
            NULLIF(e.entry ->> 'moved_by_name', '') AS changed_by_name,
            COALESCE(
              NULLIF(e.entry ->> 'moved_at', '')::timestamptz,
              v_order.created_at
            ) AS changed_at,
            NULLIF(e.entry ->> 'note', '') AS note,
            COALESCE((e.entry ->> 'auto')::boolean, false) AS is_auto
          FROM jsonb_array_elements(v_order.stage_history)
            WITH ORDINALITY AS e(entry, ord)
        ) t
        WHERE t.to_status IS NOT NULL
        ON CONFLICT DO NOTHING;

      ELSE
        INSERT INTO public.procurement_status_events (
          order_id, po_number, requisition_number, site_id, vendor_id,
          from_status, to_status, changed_by, changed_by_name, changed_at,
          note, is_auto, event_source
        )
        VALUES (
          v_order.id, v_order.po_number, v_order.requisition_number,
          v_order.site_id, v_order.vendor_id,
          NULL, COALESCE(v_order.status, 'Unknown'), v_order.created_by,
          'System', v_order.created_at,
          NULL, false, 'backfill'
        )
        ON CONFLICT DO NOTHING;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'procurement_status_events backfill skipped order %: %',
        v_order.id, SQLERRM;
    END;
  END LOOP;
END;
$backfill$;

GRANT SELECT ON public.procurement_status_events TO authenticated, service_role;
