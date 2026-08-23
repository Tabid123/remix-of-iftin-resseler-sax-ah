import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Store, Loader2 } from 'lucide-react';

const MANAGER_ROLES = ['owner', 'admin', 'manager'];

/** Dedicated reseller (tenant manager) login — separate from platform /admin/login */
const ResellerLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: 'Khalad', description: 'Gali email iyo password', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;

      const { data: memberships, error: memErr } = await supabase
        .from('tenant_members')
        .select('tenant_id, member_role, role, tenants(status)')
        .eq('user_id', data.user.id);
      if (memErr) throw memErr;

      const manager = (memberships ?? []).find((m: any) =>
        MANAGER_ROLES.includes(String(m.member_role ?? m.role ?? '').toLowerCase()) &&
        m.tenants?.status === 'active'
      );

      if (!manager?.tenant_id) {
        await supabase.auth.signOut();
        toast({
          title: 'Ma lihid fasax',
          description: 'Koontadan reseller firfircoon kuma xirna',
          variant: 'destructive',
        });
        return;
      }

      localStorage.setItem('active_tenant_id', manager.tenant_id);
      localStorage.removeItem('public_tenant_slug');
      toast({ title: 'Guul', description: 'Dashboard-ka reseller-ka waa la furay' });
      navigate('/reseller', { replace: true });
    } catch (err: any) {
      toast({
        title: 'Khalad',
        description: err?.message === 'Invalid login credentials'
          ? 'Email ama password khaldan. Haddii aad hubto xogta, admin-ka ha kuu cusboonaysiiyo password-ka.'
          : err?.message || 'Wax khalad ah ayaa dhacay',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-center gap-2">
            <Store className="h-6 w-6 text-primary" />
            <CardTitle className="text-2xl">Reseller Login</CardTitle>
          </div>
          <CardDescription className="text-center">
            Gal dashboard-ka shirkaddaada
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reseller-email">Email</Label>
              <Input
                id="reseller-email"
                type="email"
                placeholder="reseller@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reseller-password">Password</Label>
              <Input
                id="reseller-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Fadlan sug...</>) : 'Gal'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResellerLogin;
