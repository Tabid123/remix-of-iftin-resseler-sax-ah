import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  plan: string | null;
  owner_id?: string | null;
}

export interface TenantMembership extends Tenant {
  role: string;
}

interface TenantContextValue {
  loading: boolean;
  tenant: TenantMembership | null;
  tenants: TenantMembership[];
  currentTenantId: string | null;
  logoUrl: string | null;
  needsOnboarding: boolean;
  switchTenant: (tenantId: string) => void;
  refreshTenants: () => Promise<void>;
}

const STORAGE_KEY = 'active_tenant_id';
const PUBLIC_SLUG_KEY = 'public_tenant_slug';

// Resolve the storefront tenant slug for anonymous visitors:
// ?t=slug  →  saved slug  →  subdomain (slug.example.com)
const resolvePublicSlug = (): string | null => {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('t');
    if (fromUrl) {
      localStorage.setItem(PUBLIC_SLUG_KEY, fromUrl);
      return fromUrl;
    }
    const saved = localStorage.getItem(PUBLIC_SLUG_KEY);
    if (saved) return saved;
    const host = window.location.hostname;
    const parts = host.split('.');
    if (parts.length > 2 && !['www', 'id-preview', 'localhost'].includes(parts[0])) return parts[0];
  } catch { /* ignore */ }
  return null;
};

const TenantContext = createContext<TenantContextValue>({
  loading: true,
  tenant: null,
  tenants: [],
  currentTenantId: null,
  logoUrl: null,
  needsOnboarding: false,
  switchTenant: () => {},
  refreshTenants: async () => {},
});

export const useTenant = () => useContext(TenantContext);

const isHttpUrl = (v?: string | null) => !!v && /^https?:\/\//i.test(v);

export const TenantProvider = ({ children }: { children: React.ReactNode }) => {
  const [loading, setLoading] = useState(true);
  const [publicLoading, setPublicLoading] = useState(true);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [tenants, setTenants] = useState<TenantMembership[]>([]);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(
    () => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } }
  );
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [publicTenant, setPublicTenant] = useState<TenantMembership | null>(null);

  // Anonymous storefront branding (logo + primary color) via public RPC
  const loadPublicTenant = useCallback(async () => {
    const slug = resolvePublicSlug();
    if (!slug) { setPublicTenant(null); setPublicLoading(false); return; }
    const { data, error } = await supabase.rpc('get_tenant_by_slug', { _slug: slug });
    if (error || !data || !(data as any[]).length) {
      setPublicTenant(null);
      setPublicLoading(false);
      return;
    }
    const t: any = (data as any[])[0];
    setPublicTenant({
      id: t.id,
      name: t.name,
      slug: t.slug,
      logo_url: t.logo_url ?? null,
      primary_color: t.primary_color ?? null,
      secondary_color: null,
      plan: null,
      role: 'visitor',
    });
    setPublicLoading(false);
  }, []);

  const loadTenants = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setTenants([]);
      setMembershipLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('tenant_members')
      .select('role, member_role, tenant_id, tenants(id, name, slug, logo_url, primary_color, secondary_color, plan, owner_id)')
      .eq('user_id', session.user.id);

    if (error) {
      console.error('[TenantContext] load failed', error.message);
      setMembershipLoading(false);
      return;
    }

    const list: TenantMembership[] = (data || [])
      .filter((row: any) => row.tenants)
      .map((row: any) => ({ ...row.tenants, role: row.role ?? row.member_role ?? 'member' }));

    setTenants(list);
    setCurrentTenantId((prev) => (prev && list.some((t) => t.id === prev) ? prev : list[0]?.id ?? null));
    setMembershipLoading(false);
  }, []);

  useEffect(() => {
    setLoading(publicLoading || membershipLoading);
  }, [publicLoading, membershipLoading]);

  useEffect(() => {
    loadTenants();
    loadPublicTenant();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => { loadTenants(); }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadTenants, loadPublicTenant]);

  const tenant = useMemo(
    () => publicTenant ?? tenants.find((t) => t.id === currentTenantId) ?? tenants[0] ?? null,
    [tenants, currentTenantId, publicTenant]
  );

  // Persist selection
  useEffect(() => {
    try {
      if (currentTenantId) localStorage.setItem(STORAGE_KEY, currentTenantId);
    } catch { /* ignore */ }
  }, [currentTenantId]);

  // Resolve logo (private bucket → signed URL)
  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      const raw = tenant?.logo_url;
      if (!raw) { setLogoUrl(null); return; }
      if (isHttpUrl(raw)) { setLogoUrl(raw); return; }
      const { data } = await supabase.storage.from('tenant-logos').createSignedUrl(raw, 60 * 60);
      if (!cancelled) setLogoUrl(data?.signedUrl ?? null);
    };
    resolve();
    return () => { cancelled = true; };
  }, [tenant?.logo_url]);

  // Dynamic branding CSS variables
  useEffect(() => {
    const root = document.documentElement;
    const primary = tenant?.primary_color || '#0099ff';
    const match = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(primary);
    if (match) {
      const r = parseInt(match[1], 16) / 255;
      const g = parseInt(match[2], 16) / 255;
      const b = parseInt(match[3], 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      let h = 0;
      if (delta) {
        if (max === r) h = 60 * (((g - b) / delta) % 6);
        else if (max === g) h = 60 * ((b - r) / delta + 2);
        else h = 60 * ((r - g) / delta + 4);
      }
      if (h < 0) h += 360;
      const l = (max + min) / 2;
      const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
      root.style.setProperty('--primary', `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`);
      root.style.setProperty('--ring', `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`);
    }
    root.style.setProperty('--tenant-primary', primary);
    root.style.setProperty('--tenant-secondary', tenant?.secondary_color || '#ffffff');
  }, [tenant?.primary_color, tenant?.secondary_color]);

  const value: TenantContextValue = {
    loading,
    tenant,
    tenants,
    currentTenantId,
    logoUrl,
    needsOnboarding: !!tenant && (!tenant.logo_url || /^Company-/i.test(tenant.name)),
    switchTenant: (id: string) => setCurrentTenantId(id),
    refreshTenants: loadTenants,
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};