-- ============================================================
-- North Star Ventures CRM — Initial Schema Migration
-- ============================================================

-- -------------------------------------------------------
-- 1. profiles
-- -------------------------------------------------------
CREATE TABLE profiles (
    id         uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    email      text,
    is_admin   boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

-- -------------------------------------------------------
-- 2. clients
-- -------------------------------------------------------
CREATE TABLE clients (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                text,
    email               text,
    meta_ad_account_id  text,
    meta_access_token   text,
    created_at          timestamptz DEFAULT now()
);

-- -------------------------------------------------------
-- 3. ad_templates
-- -------------------------------------------------------
CREATE TABLE ad_templates (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text,
    template_body text,
    created_at    timestamptz DEFAULT now()
);

-- -------------------------------------------------------
-- 4. ads
-- -------------------------------------------------------
CREATE TABLE ads (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id      uuid REFERENCES clients ON DELETE CASCADE,
    name           text,
    status         text DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
    ad_copy        text,
    image_url      text,
    prompt_used    text,
    campaign_id    text,
    ad_set_id      text,
    ad_id          text,
    version_number integer DEFAULT 1,
    created_at     timestamptz DEFAULT now(),
    updated_at     timestamptz DEFAULT now()
);

-- -------------------------------------------------------
-- 5. ad_versions
-- -------------------------------------------------------
CREATE TABLE ad_versions (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_id          uuid REFERENCES ads ON DELETE CASCADE,
    client_id      uuid REFERENCES clients ON DELETE CASCADE,
    ad_copy        text,
    prompt_used    text,
    version_number integer,
    saved_at       timestamptz DEFAULT now()
);

-- -------------------------------------------------------
-- 6. meta_snapshots
-- -------------------------------------------------------
CREATE TABLE meta_snapshots (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id      uuid REFERENCES clients ON DELETE CASCADE,
    snapshot_date  date,
    campaign_id    text,
    campaign_name  text,
    ad_set_id      text,
    ad_set_name    text,
    ad_id          text,
    ad_name        text,
    spend          numeric,
    impressions    integer,
    clicks         integer,
    ctr            numeric,
    cpl            numeric,
    roas           numeric,
    leads          integer,
    created_at     timestamptz DEFAULT now()
);

-- -------------------------------------------------------
-- 7. contacts
-- -------------------------------------------------------
CREATE TABLE contacts (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id            uuid REFERENCES clients ON DELETE CASCADE,
    first_name           text,
    last_name            text,
    phone                text,
    email                text,
    source_ad_id         text,
    source_ad_name       text,
    source_ad_set_id     text,
    source_ad_set_name   text,
    source_campaign_id   text,
    source_campaign_name text,
    pipeline_stage       text DEFAULT 'new_lead' CHECK (pipeline_stage IN ('new_lead','contacted','qualified','booked','won','lost')),
    lead_quality         text CHECK (lead_quality IN ('good','bad') OR lead_quality IS NULL),
    fb_lead_id           text,
    notes                text,
    created_at           timestamptz DEFAULT now(),
    updated_at           timestamptz DEFAULT now()
);

-- -------------------------------------------------------
-- 8. pipeline_events
-- -------------------------------------------------------
CREATE TABLE pipeline_events (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id uuid REFERENCES contacts ON DELETE CASCADE,
    client_id  uuid REFERENCES clients ON DELETE CASCADE,
    from_stage text,
    to_stage   text,
    changed_at timestamptz DEFAULT now(),
    changed_by uuid REFERENCES profiles
);

-- -------------------------------------------------------
-- 9. client_kpis
-- -------------------------------------------------------
CREATE TABLE client_kpis (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id         uuid REFERENCES clients ON DELETE CASCADE UNIQUE,
    max_cpl           numeric,
    min_roas          numeric,
    min_leads_per_day integer,
    min_ctr           numeric,
    monthly_budget    numeric,
    updated_at        timestamptz DEFAULT now()
);

-- -------------------------------------------------------
-- 10. client_health
-- -------------------------------------------------------
CREATE TABLE client_health (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id     uuid REFERENCES clients ON DELETE CASCADE UNIQUE,
    status        text CHECK (status IN ('healthy','warning','critical')),
    flags         jsonb,
    calculated_at timestamptz DEFAULT now()
);

-- -------------------------------------------------------
-- 11. client_notes (admin-only)
-- -------------------------------------------------------
CREATE TABLE client_notes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id  uuid REFERENCES clients ON DELETE CASCADE UNIQUE,
    content    text,
    updated_at timestamptz DEFAULT now()
);

-- -------------------------------------------------------
-- 12. client_tasks
-- -------------------------------------------------------
CREATE TABLE client_tasks (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   uuid REFERENCES clients ON DELETE CASCADE,
    title       text,
    is_complete boolean DEFAULT false,
    due_date    date,
    created_at  timestamptz DEFAULT now()
);

-- -------------------------------------------------------
-- 13. client_pixel_config
-- -------------------------------------------------------
CREATE TABLE client_pixel_config (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id         uuid REFERENCES clients ON DELETE CASCADE UNIQUE,
    pixel_id          text,
    capi_access_token text,
    stage_event_map   jsonb DEFAULT '{"stage_booked":{"event":"Schedule","enabled":true},"stage_won":{"event":"Purchase","enabled":true},"stage_qualified":{"event":"Contact","enabled":false},"quality_good":{"event":"Lead","enabled":true},"quality_bad":{"event":"","enabled":false}}'::jsonb,
    updated_at        timestamptz DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_contacts_client_stage     ON contacts (client_id, pipeline_stage);
CREATE INDEX idx_contacts_client_created   ON contacts (client_id, created_at);
CREATE INDEX idx_meta_snapshots_client_date ON meta_snapshots (client_id, snapshot_date);
CREATE INDEX idx_pipeline_events_contact   ON pipeline_events (contact_id);
CREATE INDEX idx_ads_client_status         ON ads (client_id, status);

-- ============================================================
-- ENABLE ROW LEVEL SECURITY ON EVERY TABLE
-- ============================================================
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads                ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_versions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_kpis        ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_health      ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_tasks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_pixel_config ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER: reusable admin check
-- ============================================================
-- We use an inline EXISTS subquery everywhere so we don't need
-- a separate function (avoids SECURITY DEFINER pitfalls).
--   EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- -------------------------------------------------------
-- profiles
-- -------------------------------------------------------
CREATE POLICY profiles_select_own ON profiles
    FOR SELECT USING (id = auth.uid());

CREATE POLICY profiles_admin_select ON profiles
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY profiles_admin_insert ON profiles
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY profiles_admin_update ON profiles
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY profiles_admin_delete ON profiles
    FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- -------------------------------------------------------
-- clients  (client's own row: clients.id = auth.uid())
-- -------------------------------------------------------
CREATE POLICY clients_select_own ON clients
    FOR SELECT USING (id = auth.uid());

CREATE POLICY clients_admin_select ON clients
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY clients_admin_insert ON clients
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY clients_admin_update ON clients
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY clients_admin_delete ON clients
    FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- -------------------------------------------------------
-- ad_templates  (all authenticated can read; admin CRUD)
-- -------------------------------------------------------
CREATE POLICY ad_templates_select_all ON ad_templates
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY ad_templates_admin_insert ON ad_templates
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY ad_templates_admin_update ON ad_templates
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY ad_templates_admin_delete ON ad_templates
    FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- -------------------------------------------------------
-- ads  (client reads own; admin all)
-- -------------------------------------------------------
CREATE POLICY ads_select_own ON ads
    FOR SELECT USING (client_id = auth.uid());

CREATE POLICY ads_admin_select ON ads
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY ads_admin_insert ON ads
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY ads_admin_update ON ads
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY ads_admin_delete ON ads
    FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY ads_insert_own ON ads
    FOR INSERT WITH CHECK (client_id = auth.uid());

CREATE POLICY ads_update_own ON ads
    FOR UPDATE USING (client_id = auth.uid());

-- -------------------------------------------------------
-- ad_versions  (client reads own; admin all)
-- -------------------------------------------------------
CREATE POLICY ad_versions_select_own ON ad_versions
    FOR SELECT USING (client_id = auth.uid());

CREATE POLICY ad_versions_admin_select ON ad_versions
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY ad_versions_admin_insert ON ad_versions
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY ad_versions_admin_update ON ad_versions
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY ad_versions_admin_delete ON ad_versions
    FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- -------------------------------------------------------
-- meta_snapshots  (client reads own; admin all)
-- -------------------------------------------------------
CREATE POLICY meta_snapshots_select_own ON meta_snapshots
    FOR SELECT USING (client_id = auth.uid());

CREATE POLICY meta_snapshots_admin_select ON meta_snapshots
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY meta_snapshots_admin_insert ON meta_snapshots
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY meta_snapshots_admin_update ON meta_snapshots
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY meta_snapshots_admin_delete ON meta_snapshots
    FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- -------------------------------------------------------
-- contacts  (client reads own; admin all)
-- -------------------------------------------------------
CREATE POLICY contacts_select_own ON contacts
    FOR SELECT USING (client_id = auth.uid());

CREATE POLICY contacts_admin_select ON contacts
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY contacts_admin_insert ON contacts
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY contacts_admin_update ON contacts
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY contacts_admin_delete ON contacts
    FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY contacts_insert_own ON contacts
    FOR INSERT WITH CHECK (client_id = auth.uid());

CREATE POLICY contacts_update_own ON contacts
    FOR UPDATE USING (client_id = auth.uid());

-- -------------------------------------------------------
-- pipeline_events  (client reads own; admin all)
-- -------------------------------------------------------
CREATE POLICY pipeline_events_select_own ON pipeline_events
    FOR SELECT USING (client_id = auth.uid());

CREATE POLICY pipeline_events_admin_select ON pipeline_events
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY pipeline_events_admin_insert ON pipeline_events
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY pipeline_events_admin_update ON pipeline_events
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY pipeline_events_admin_delete ON pipeline_events
    FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY pipeline_events_insert_own ON pipeline_events
    FOR INSERT WITH CHECK (client_id = auth.uid());

-- -------------------------------------------------------
-- client_kpis  (client reads own; admin all)
-- -------------------------------------------------------
CREATE POLICY client_kpis_select_own ON client_kpis
    FOR SELECT USING (client_id = auth.uid());

CREATE POLICY client_kpis_admin_select ON client_kpis
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY client_kpis_admin_insert ON client_kpis
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY client_kpis_admin_update ON client_kpis
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY client_kpis_admin_delete ON client_kpis
    FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- -------------------------------------------------------
-- client_health  (client reads own; admin all)
-- -------------------------------------------------------
CREATE POLICY client_health_select_own ON client_health
    FOR SELECT USING (client_id = auth.uid());

CREATE POLICY client_health_admin_select ON client_health
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY client_health_admin_insert ON client_health
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY client_health_admin_update ON client_health
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY client_health_admin_delete ON client_health
    FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- -------------------------------------------------------
-- client_notes  (admin-only — clients never see these)
-- -------------------------------------------------------
CREATE POLICY client_notes_admin_select ON client_notes
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY client_notes_admin_insert ON client_notes
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY client_notes_admin_update ON client_notes
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY client_notes_admin_delete ON client_notes
    FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- -------------------------------------------------------
-- client_tasks  (admin-only — clients never see these)
-- -------------------------------------------------------
CREATE POLICY client_tasks_admin_select ON client_tasks
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY client_tasks_admin_insert ON client_tasks
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY client_tasks_admin_update ON client_tasks
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY client_tasks_admin_delete ON client_tasks
    FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- -------------------------------------------------------
-- client_pixel_config  (admin-only)
-- -------------------------------------------------------
CREATE POLICY client_pixel_config_admin_select ON client_pixel_config
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY client_pixel_config_admin_insert ON client_pixel_config
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY client_pixel_config_admin_update ON client_pixel_config
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY client_pixel_config_admin_delete ON client_pixel_config
    FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
