import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const MANAGER_ROLES = ['owner', 'admin', 'manager'];

/**
 * Guards /reseller: only a signed-in user who is owner/admin of a tenant
 * (or a platform super admin) may enter.
 */
const ResellerRoute = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/admin/login', { replace: true }); return; }

      const [{ data: membership }, { data: superRole }] = await Promise.all([
        supabase
          .from('tenant_members')
          .select('member_role, role, tenant_id')
          .eq('user_id', user.id),
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .in('role', ['admin', 'super_admin'])
          .maybeSingle(),
      ]);

      const isManager = (membership ?? []).some((m: any) =>
        MANAGER_ROLES.includes(String(m.member_role ?? m.role ?? '').toLowerCase())
      );

      if (!active) return;

      if (isManager || superRole) {
        setAllowed(true);
        setChecking(false);
        return;
      }

      toast({
        title: 'Ma lihid fasax',
        description: 'Kaliya maamulaha tenant-ka ayaa geli kara reseller dashboard-ka',
        variant: 'destructive',
      });
      navigate('/admin/login', { replace: true });
    };

    check();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') navigate('/admin/login', { replace: true });
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [navigate]);

  if (checking || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
};

export default ResellerRoute;
