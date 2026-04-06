-- ============================================================
-- North Star Ventures CRM — Patch A, B, C Migration
-- ============================================================

-- -------------------------------------------------------
-- 1. client_checklist table
-- -------------------------------------------------------
CREATE TABLE client_checklist (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id                   uuid REFERENCES clients ON DELETE CASCADE UNIQUE,
    business_manager_connected  boolean DEFAULT false,
    connected_to_ad_manager     boolean DEFAULT false,
    ad_created                  boolean DEFAULT false,
    ads_scheduled               boolean DEFAULT false,
    api_set_up                  boolean DEFAULT false,
    pixel_set_up                boolean DEFAULT false,
    lead_notification_set_up    boolean DEFAULT false,
    updated_at                  timestamptz DEFAULT now()
);

ALTER TABLE client_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_checklist_admin_select ON client_checklist
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY client_checklist_admin_insert ON client_checklist
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY client_checklist_admin_update ON client_checklist
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY client_checklist_admin_delete ON client_checklist
    FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Client can read own checklist
CREATE POLICY client_checklist_select_own ON client_checklist
    FOR SELECT USING (client_id = auth.uid());

-- -------------------------------------------------------
-- 2. Add lead_sms_number and lead_sms_enabled to clients
-- -------------------------------------------------------
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lead_sms_number text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lead_sms_enabled boolean DEFAULT false;

-- -------------------------------------------------------
-- 3. Add lead_score to contacts
-- -------------------------------------------------------
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score integer;

-- -------------------------------------------------------
-- 4. Add min_cac to client_kpis
-- -------------------------------------------------------
ALTER TABLE client_kpis ADD COLUMN IF NOT EXISTS min_cac numeric;

-- -------------------------------------------------------
-- 5. Add ad_fatigue jsonb to ads
-- -------------------------------------------------------
ALTER TABLE ads ADD COLUMN IF NOT EXISTS ad_fatigue jsonb;

-- -------------------------------------------------------
-- 6. Index for checklist lookups
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_client_checklist_client ON client_checklist (client_id);
