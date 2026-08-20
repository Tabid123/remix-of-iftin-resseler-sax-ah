import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Shield, Loader2, AlertTriangle, KeyRound, Crown } from 'lucide-react';
import iftinLogo from '@/assets/iftin-logo.jpg';

// TEMPORARY EMERGENCY BYPASS - Feb 22, 2026 kadib waa la saari doonaa
// Supabase secrets browser-ka ma gaadho, sidaa darteed PIN code-ka ku jira
const EMERGENCY_PIN = '5516';

const AdminLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEmergencyMode, setShowEmergencyMode] = useState(false);
  const [emergencyPin, setEmergencyPin] = useState('');

  const isServiceRestricted = (errorMsg: string) => {
    return errorMsg.toLowerCase().includes('restricted') ||
           errorMsg.toLowerCase().includes('quota') ||
           errorMsg.toLowerCase().includes('exceeded') ||
           errorMsg.toLowerCase().includes('fetch') ||
           errorMsg.toLowerCase().includes('network') ||
           errorMsg.toLowerCase().includes('failed to fetch');
  };

  const handleEmergencyLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMERGENCY_PIN) {
      toast({ title: 'Khalad', description: 'Emergency PIN lama helin', variant: 'destructive' });
      return;
    }
    if (emergencyPin === EMERGENCY_PIN) {
      // TEMPORARY local session - Supabase xiran yahay
      localStorage.setItem('adminEmergencySession', 'true');
      localStorage.setItem('adminEmergencyTime', Date.now().toString());
      toast({ title: '✅ Guul', description: 'Emergency mode: Admin waa la soo galay' });
      navigate('/admin');
    } else {
      toast({ title: 'Khalad PIN', description: 'PIN-ka waa khalad', variant: 'destructive' });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: 'Khalad',
        description: 'Gali email iyo password',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Hubi haddii Supabase xiran yahay (quota/restricted error)
        if (isServiceRestricted(error.message)) {
          setShowEmergencyMode(true);
          toast({
            title: '⚠️ Supabase Xiran',
            description: 'Service waa xiran. Emergency mode isticmaal.',
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }
        throw error;
      }

      // Check if user has admin role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', data.user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (!roleData) {
        // Tenant manager (reseller) → reseller dashboard
        const { data: memberships } = await supabase
          .from('tenant_members')
          .select('member_role, role')
          .eq('user_id', data.user.id);

        const isTenantManager = (memberships ?? []).some((m: any) =>
          ['owner', 'admin', 'manager'].includes(String(m.member_role ?? m.role ?? '').toLowerCase())
        );

        if (isTenantManager) {
          toast({ title: 'Guul', description: 'Waad soo gashay' });
          navigate('/reseller');
          setLoading(false);
          return;
        }

        // First-admin bootstrap: if NO admin exists in the system yet,
        // grant admin role to this newly signed-in user.
        const { data: bootstrapResult } = await supabase.rpc('bootstrap_first_admin');
        const bootstrapped = (bootstrapResult as any)?.ok === true;

        if (!bootstrapped) {
          await supabase.auth.signOut();
          toast({
            title: 'Ma lihid fasax',
            description: 'Admin kaliya ayaa geli kara',
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }

        toast({
          title: '👑 First Admin',
          description: 'Waxaa lagu sameeyay admin-ka ugu horreeya',
        });
      }

      toast({
        title: 'Guul',
        description: 'Waad soo gashay',
      });

      navigate('/admin');

    } catch (error: any) {
      // Haddii connection-ka oo dhan fashilmo (network error)
      if (isServiceRestricted(error.message || '')) {
        setShowEmergencyMode(true);
        toast({
          title: '⚠️ Supabase Xiran',
          description: 'Service ma heli karo. Emergency mode isticmaal.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Khalad',
          description: error.message || 'Wax khalad ah ayaa dhacay',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="w-32 h-16 mx-auto">
            <img 
              src={iftinLogo} 
              alt="IFTIN Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex items-center justify-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <CardTitle className="text-2xl">Admin Login</CardTitle>
          </div>
          <CardDescription className="text-center">
            Gal admin dashboard-ka
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Normal login form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Fadlan sug...
                </>
              ) : (
                'Gal'
              )}
            </Button>
          </form>

          {/* Emergency Mode - Supabase xiran yahay */}
          {showEmergencyMode && (
            <div className="border border-destructive/50 rounded-lg p-4 bg-destructive/5 space-y-3">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-semibold text-sm">Emergency Mode - Supabase Xiran</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Supabase service-ku ma shaqaynayso (quota exceeded). PIN-ka gaar ah ku gal si aad ugu geshid dashboard-ka.
              </p>
              <form onSubmit={handleEmergencyLogin} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="emergency-pin" className="flex items-center gap-1">
                    <KeyRound className="h-4 w-4" />
                    Emergency PIN
                  </Label>
                  <Input
                    id="emergency-pin"
                    type="password"
                    placeholder="PIN gali"
                    value={emergencyPin}
                    onChange={(e) => setEmergencyPin(e.target.value)}
                    required
                    className="border-destructive/50"
                  />
                </div>
                <Button type="submit" variant="destructive" className="w-full">
                  <KeyRound className="mr-2 h-4 w-4" />
                  Emergency Gal
                </Button>
              </form>
            </div>
          )}

          {/* Manual emergency mode trigger */}
          {!showEmergencyMode && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground text-xs"
              onClick={() => setShowEmergencyMode(true)}
            >
              Supabase xiran? Emergency mode
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogin;
