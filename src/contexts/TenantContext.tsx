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
  const [tenants, setTenants] = useState<TenantMembership[]>([]);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(
    () => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } }
  );
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const loadTenants = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setTenants([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('tenant_members')
      .select('role, member_role, tenant_id, tenants(id, name, slug, logo_url, primary_color, secondary_color, plan, owner_id)')
      .eq('user_id', session.user.id);

    if (error) {
      console.error('[TenantContext] load failed', error.message);
      setLoading(false);
      return;
    }

    const list: TenantMembership[] = (data || [])
      .filter((row: any) => row.tenants)
      .map((row: any) => ({ ...row.tenants, role: row.role ?? row.member_role ?? 'member' }));

    setTenants(list);
    setCurrentTenantId((prev) => (prev && list.some((t) => t.id === prev) ? prev : list[0]?.id ?? null));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTenants();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => { loadTenants(); }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadTenants]);

  const tenant = useMemo(
    () => tenants.find((t) => t.id === currentTenantId) ?? null,
    [tenants, currentTenantId]
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
    root.style.setProperty('--tenant-primary', tenant?.primary_color || '#000000');
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