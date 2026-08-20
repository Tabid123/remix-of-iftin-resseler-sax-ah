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
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const [{ data: memberships }, { data: superRole }] = await Promise.all([
        supabase.from('tenant_members').select('member_role, role').eq('user_id', data.user.id),
        supabase.from('user_roles').select('role').eq('user_id', data.user.id).in('role', ['admin', 'super_admin']).maybeSingle(),
      ]);

      const isManager = (memberships ?? []).some((m: any) =>
        MANAGER_ROLES.includes(String(m.member_role ?? m.role ?? '').toLowerCase())
      );

      if (!isManager && !superRole) {
        await supabase.auth.signOut();
        toast({
          title: 'Ma lihid fasax',
          description: 'Kaliya maamulaha reseller-ka ayaa geli kara',
          variant: 'destructive',
        });
        return;
      }

      toast({ title: 'Guul', description: 'Waad soo gashay' });
      navigate('/reseller', { replace: true });
    } catch (err: any) {
      toast({ title: 'Khalad', description: err.message || 'Wax khalad ah ayaa dhacay', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-center gap-2">
            <Store className="h-6 w-6 text-primary" />
            <CardTitle className="text-2xl">Reseller Login</CardTitle>
          </div>
          <CardDescription className="text-center">Gal dashboard-ka reseller-ka</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="reseller@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
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
