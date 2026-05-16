
-- =========================================================
-- ENUMS
-- =========================================================
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ussd_method AS ENUM ('single_step', 'interactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================
-- HELPER: updated_at trigger
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =========================================================
-- BASE: providers, payment providers, categories, packages
-- =========================================================
CREATE TABLE public.providers_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text NOT NULL UNIQUE,
  provider_logo text,
  is_active boolean DEFAULT true,
  api_endpoint text,
  api_key text,
  promotional_text text DEFAULT 'Iftin ka iibso Internet adigoona qof wicin, waqti kasta, xitaa offline!',
  display_order integer NOT NULL DEFAULT 0,
  evoucher_rate numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.payment_providers_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text NOT NULL UNIQUE,
  provider_logo text,
  commission_rate numeric NOT NULL,
  is_active boolean DEFAULT true,
  api_credentials jsonb,
  ussd_code_template text,
  payment_number text,
  prefix_code text,
  ussd_prefix text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.package_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  provider_id uuid REFERENCES public.providers_config(id) ON DELETE CASCADE,
  category_image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.data_packages_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers_config(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.package_categories(id) ON DELETE SET NULL,
  package_name text NOT NULL,
  data_amount text NOT NULL,
  validity_days text NOT NULL,
  cost_price numeric NOT NULL,
  selling_price numeric NOT NULL,
  profit_margin numeric NOT NULL,
  is_active boolean DEFAULT true,
  connection_type_label text DEFAULT 'Mobile Internet',
  ussd_code text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- =========================================================
-- ORDERS
-- =========================================================
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone text NOT NULL,
  receiver_phone text NOT NULL,
  package_id uuid NOT NULL REFERENCES public.data_packages_config(id),
  provider_id uuid NOT NULL REFERENCES public.providers_config(id),
  payment_provider_id uuid NOT NULL,
  package_name text NOT NULL,
  data_amount text NOT NULL,
  selling_price numeric NOT NULL,
  payment_number text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  delivery_status text DEFAULT 'pending',
  delivered_at timestamptz,
  delivery_notes text,
  sender_phone text,
  payment_source text DEFAULT 'sms_offline',
  invoice_url text,
  is_manual boolean DEFAULT false,
  intent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- DELIVERY
-- =========================================================
CREATE TABLE public.delivery_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers_config(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.package_categories(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  instruction_template text NOT NULL,
  code_template text,
  notes text,
  sim_password text,
  ussd_method public.ussd_method NOT NULL DEFAULT 'single_step',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.delivery_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  provider_name text NOT NULL,
  ussd_code text NOT NULL,
  receiver_phone text NOT NULL,
  package_code text,
  status text DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  attempts integer DEFAULT 0,
  last_attempt_at timestamptz,
  error_message text,
  android_device_id text,
  sim_slot integer DEFAULT 1,
  pin_code text,
  provider_response text,
  scheduled_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- =========================================================
-- DEVICES
-- =========================================================
CREATE TABLE public.android_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_name text NOT NULL,
  device_id text NOT NULL,
  provider_name text NOT NULL,
  sim_number text NOT NULL,
  is_active boolean DEFAULT true,
  last_ping_at timestamptz,
  total_deliveries integer DEFAULT 0,
  failed_deliveries integer DEFAULT 0,
  archived_at timestamptz,
  device_config jsonb,
  sim1_provider text,
  sim2_provider text,
  sim2_number text,
  battery_level integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE,
  device_name text,
  sim1_number text,
  sim2_number text,
  is_active boolean NOT NULL DEFAULT true,
  last_seen timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.device_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  device_name text NOT NULL,
  alert_type text NOT NULL DEFAULT 'offline',
  is_acknowledged boolean DEFAULT false,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  sms_count integer DEFAULT 1,
  last_sms_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.sim_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sim_id uuid NOT NULL REFERENCES public.android_devices(id) ON DELETE CASCADE,
  balance numeric NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  balance_type text NOT NULL DEFAULT 'manual' CHECK (balance_type IN ('evc_plus','evoucher','manual')),
  balance_source text DEFAULT 'manual' CHECK (balance_source IN ('manual','sms','ussd')),
  sim_slot integer DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- PAYMENTS / FRAUD
-- =========================================================
CREATE TABLE public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_phone text NOT NULL,
  receiver_sim text NOT NULL,
  amount numeric NOT NULL,
  sms_body text,
  matched_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  matching_strategy text,
  status text DEFAULT 'pending',
  admin_notes text,
  processed_at timestamptz,
  tx_id text UNIQUE,
  payment_hash text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.fraud_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_receipt_id uuid REFERENCES public.payment_receipts(id) ON DELETE CASCADE,
  sender_phone text NOT NULL,
  amount numeric NOT NULL,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  description text,
  is_reviewed boolean NOT NULL DEFAULT false,
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pending_online_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verified_phone text NOT NULL,
  receiver_phone text NOT NULL,
  provider_id uuid REFERENCES public.providers_config(id) ON DELETE SET NULL,
  package_id uuid REFERENCES public.data_packages_config(id) ON DELETE SET NULL,
  payment_provider text,
  expected_amount numeric NOT NULL,
  ussd_code text,
  status text DEFAULT 'pending',
  sender_phone text,
  expires_at timestamptz DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz DEFAULT now()
);

-- =========================================================
-- DISCOUNTS / FEATURED / RULES
-- =========================================================
CREATE TABLE public.featured_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL UNIQUE REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.customer_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone text NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  discount_value numeric NOT NULL,
  is_active boolean DEFAULT true,
  applicable_to text CHECK (applicable_to IN ('all','provider','package')),
  provider_id uuid REFERENCES public.providers_config(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.discount_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  discount_value numeric NOT NULL,
  is_active boolean DEFAULT true,
  valid_from timestamptz DEFAULT now(),
  valid_until timestamptz,
  usage_limit integer,
  times_used integer DEFAULT 0,
  applicable_to text CHECK (applicable_to IN ('all','provider','package')),
  provider_id uuid REFERENCES public.providers_config(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.package_delivery_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_package_id uuid NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  target_package_id uuid NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  delivery_count integer NOT NULL DEFAULT 1,
  delay_minutes integer NOT NULL DEFAULT 0,
  execution_order integer NOT NULL DEFAULT 1,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.package_profit_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL UNIQUE REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  custom_profit_margin numeric NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- =========================================================
-- USERS / ROLES / ADMINS
-- =========================================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE TABLE public.admin_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission_key text NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- VERIFIED PHONES / OFFLINE / OTP
-- =========================================================
CREATE TABLE public.verified_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL UNIQUE,
  verification_code text,
  verified_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.offline_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_phone text NOT NULL UNIQUE,
  receiver_phone text NOT NULL,
  provider_id uuid REFERENCES public.providers_config(id) ON DELETE SET NULL,
  provider_name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.sms_otp_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  otp_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  device_id text,
  provider text DEFAULT 'hormuud',
  processed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.blocked_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL UNIQUE,
  reason text,
  blocked_by uuid,
  is_active boolean NOT NULL DEFAULT true,
  unblocked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.auto_topup_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL UNIQUE,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- BULK SMS
-- =========================================================
CREATE TABLE public.bulk_sms_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  target_type text NOT NULL DEFAULT 'all',
  target_filter jsonb,
  device_id text,
  sim_slot integer DEFAULT 1,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bulk_sms_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.bulk_sms_campaigns(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  device_id text,
  sim_slot integer DEFAULT 1,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- OUTREACH
-- =========================================================
CREATE TABLE public.outreach_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_quota integer NOT NULL DEFAULT 10,
  sms_template text NOT NULL DEFAULT 'Salaan, Iftin Internet waxay haystaa pakeej cusub oo qiimo jaban. Booqo: https://iftininternet.com',
  cooldown_days integer NOT NULL DEFAULT 30,
  follow_up_days integer NOT NULL DEFAULT 10,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.outreach_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  assigned_to uuid,
  assigned_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Mogadishu')::date),
  status text NOT NULL DEFAULT 'pending',
  contact_method text,
  notes text,
  contacted_at timestamptz,
  converted_at timestamptz,
  follow_up_due_at timestamptz,
  follow_up_count integer NOT NULL DEFAULT 0,
  last_follow_up_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- MISC: settings, banners, notifications, errors, apk
-- =========================================================
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value boolean DEFAULT true,
  text_value text,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.banners_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_image text NOT NULL,
  alt_text text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  media_type text DEFAULT 'image' CHECK (media_type IN ('image','video')),
  video_duration integer CHECK (video_duration IS NULL OR (video_duration > 0 AND video_duration <= 300)),
  rotation_interval integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.error_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type text NOT NULL UNIQUE,
  title text NOT NULL,
  message text NOT NULL,
  icon_type text NOT NULL CHECK (icon_type IN ('emoji','image')),
  icon_value text NOT NULL,
  is_animated boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.apk_builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  build_number integer NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  storage_path text NOT NULL,
  github_sha text,
  is_latest boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- =========================================================
-- updated_at triggers (key tables)
-- =========================================================
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'providers_config','payment_providers_config','package_categories','data_packages_config',
    'orders','delivery_instructions','app_settings','banners_config','notifications',
    'error_messages','customer_discounts','discount_codes','package_delivery_rules',
    'package_profit_overrides','featured_packages','offline_registrations',
    'outreach_settings','outreach_targets','devices','verified_phones'
  ]) LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();', t);
  END LOOP;
END $$;

-- =========================================================
-- ENABLE RLS on every table
-- =========================================================
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- =========================================================
-- POLICIES
-- =========================================================
-- Public catalog read access
CREATE POLICY "public read providers" ON public.providers_config FOR SELECT USING (true);
CREATE POLICY "public read payment_providers" ON public.payment_providers_config FOR SELECT USING (true);
CREATE POLICY "public read categories" ON public.package_categories FOR SELECT USING (true);
CREATE POLICY "public read packages" ON public.data_packages_config FOR SELECT USING (true);
CREATE POLICY "public read banners" ON public.banners_config FOR SELECT USING (true);
CREATE POLICY "public read notifications" ON public.notifications FOR SELECT USING (true);
CREATE POLICY "public read errors" ON public.error_messages FOR SELECT USING (true);
CREATE POLICY "public read app_settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "public read featured" ON public.featured_packages FOR SELECT USING (true);
CREATE POLICY "public read delivery_instructions" ON public.delivery_instructions FOR SELECT USING (true);
CREATE POLICY "public read apk_builds" ON public.apk_builds FOR SELECT USING (true);

-- Admin write access on catalog/admin tables
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'providers_config','payment_providers_config','package_categories','data_packages_config',
    'banners_config','notifications','error_messages','app_settings','featured_packages',
    'delivery_instructions','apk_builds','customer_discounts','discount_codes',
    'package_delivery_rules','package_profit_overrides','auto_topup_numbers',
    'blocked_users','android_devices','devices','sim_balances','device_alerts',
    'fraud_alerts','payment_receipts','orders','delivery_queue','pending_online_payments',
    'offline_registrations','admin_permissions','admin_verification_codes','audit_logs',
    'bulk_sms_campaigns','bulk_sms_queue','outreach_settings','outreach_targets',
    'sms_otp_queue','verified_phones','user_roles'
  ]) LOOP
    EXECUTE format($f$CREATE POLICY "admin all %1$s" ON public.%1$s FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));$f$, t);
  END LOOP;
END $$;

-- Allow users to read their own role
CREATE POLICY "users read own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- =========================================================
-- SEED *725 USSD interactive flow settings
-- =========================================================
INSERT INTO public.app_settings (setting_key, setting_value, text_value, description) VALUES
  ('ussd_725_enabled', true, NULL, 'Master toggle for the interactive *725 USSD method'),
  ('ussd_725_step1_response', NULL, '2', 'E-Voucher menu reply'),
  ('ussd_725_step2_response', NULL, '{amount}', 'Fadlan Geli lacagta reply'),
  ('ussd_725_step3_response', NULL, '{receiver}', 'Fadlan Hubi Mobilka reply'),
  ('ussd_725_step4_response', NULL, '{receiver}', 'Fadlan Geli Mobile-ka reply'),
  ('ussd_725_step5_response', NULL, '{pin}', 'PIN-kaaga reply'),
  ('ussd_725_step6_response', NULL, '1', 'Ma hubtaa confirmation reply')
ON CONFLICT (setting_key) DO NOTHING;
