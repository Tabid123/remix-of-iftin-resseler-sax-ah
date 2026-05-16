import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { Phone, MessageSquare, CheckCircle2, XCircle, RefreshCw, Settings as SettingsIcon, Loader2, Save, TrendingUp, BellRing, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type OutreachStatus = 'pending' | 'called' | 'messaged' | 'converted' | 'not_interested';

interface OutreachTarget {
  id: string;
  phone_number: string;
  status: OutreachStatus;
  contact_method: string | null;
  notes: string | null;
  contacted_at: string | null;
  converted_at: string | null;
  assigned_date: string;
  created_at: string;
  follow_up_due_at?: string | null;
  follow_up_count?: number;
  last_follow_up_at?: string | null;
}

interface FollowUpTarget {
  id: string;
  phone_number: string;
  status: string;
  contact_method: string | null;
  notes: string | null;
  contacted_at: string | null;
  follow_up_due_at: string | null;
  follow_up_count: number;
  last_follow_up_at: string | null;
  assigned_date: string;
  days_overdue: number;
}

interface OutreachSettings {
  id: string;
  daily_quota: number;
  sms_template: string;
  cooldown_days: number;
  follow_up_days: number;
}

interface AndroidDevice {
  id: string;
  device_id: string;
  device_name: string;
  is_active: boolean | null;
}

const statusBadgeVariant = (s: OutreachStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (s) {
    case 'converted': return 'default';
    case 'called':
    case 'messaged': return 'secondary';
    case 'not_interested': return 'destructive';
    default: return 'outline';
  }
};

const formatPhone = (p: string) => {
  const digits = p.replace(/\D/g, '').replace(/^252/, '');
  return `+252-${digits}`;
};

export function OutreachDashboard() {
  const { language } = useLanguage();
  const isSo = language === 'so';
  const [activeTab, setActiveTab] = useState<'today' | 'followup' | 'history' | 'stats' | 'settings'>('today');

  const [targets, setTargets] = useState<OutreachTarget[]>([]);
  const [history, setHistory] = useState<OutreachTarget[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpTarget[]>([]);
  const [settings, setSettings] = useState<OutreachSettings | null>(null);
  const [devices, setDevices] = useState<AndroidDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [targetsRes, historyRes, settingsRes, devicesRes, followUpsRes] = await Promise.all([
        supabase.from('outreach_targets').select('*').eq('assigned_date', today).order('created_at', { ascending: true }),
        supabase.from('outreach_targets').select('*').gte('assigned_date', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)).order('assigned_date', { ascending: false }).limit(200),
        supabase.from('outreach_settings').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('android_devices').select('id, device_id, device_name, is_active').eq('is_active', true).order('device_name'),
        supabase.rpc('get_outreach_follow_ups' as any),
      ]);

      if (targetsRes.data) setTargets(targetsRes.data as OutreachTarget[]);
      if (historyRes.data) setHistory(historyRes.data as OutreachTarget[]);
      if (settingsRes.data) setSettings(settingsRes.data as OutreachSettings);
      if (followUpsRes.data) setFollowUps(followUpsRes.data as FollowUpTarget[]);
      if (devicesRes.data) {
        setDevices(devicesRes.data as AndroidDevice[]);
        if (devicesRes.data.length && !selectedDeviceId) {
          setSelectedDeviceId((devicesRes.data[0] as AndroidDevice).device_id);
        }
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Realtime: refresh when targets change
  useEffect(() => {
    const ch = supabase
      .channel('outreach-targets-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'outreach_targets' }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadAll]);

  useEffect(() => {
    if (followUps.length > 0 && activeTab === 'today') {
      setActiveTab('followup');
    }
  }, [followUps.length, activeTab]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase.rpc('generate_daily_outreach_targets', {
        p_admin_id: userData.user?.id ?? null,
      });
      if (error) throw error;
      const inserted = (data as any)?.[0]?.inserted_count ?? 0;
      toast({
        title: isSo ? 'Liis cusub' : 'List generated',
        description: isSo ? `${inserted} macmiil oo cusub ayaa lagu daray` : `${inserted} new targets added`,
      });
      await loadAll();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const updateTarget = async (id: string, patch: Partial<OutreachTarget>) => {
    const { error } = await supabase.from('outreach_targets').update(patch).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handleCall = async (t: OutreachTarget) => {
    const phone = `+252${t.phone_number.replace(/\D/g, '').replace(/^252/, '')}`;
    window.location.href = `tel:${phone}`;
    await updateTarget(t.id, {
      status: t.status === 'converted' ? 'converted' : 'called',
      contact_method: t.contact_method === 'sms' ? 'both' : 'call',
      contacted_at: new Date().toISOString(),
    });
  };

  const handleSendSms = async (t: OutreachTarget) => {
    if (!settings) return;
    if (!selectedDeviceId) {
      toast({ title: isSo ? 'Aalad ma jirto' : 'No device', description: isSo ? 'Dooro Android device' : 'Select an Android device', variant: 'destructive' });
      return;
    }
    try {
      const { data: userData } = await supabase.auth.getUser();
      // Create campaign
      const { data: camp, error: campErr } = await supabase
        .from('bulk_sms_campaigns')
        .insert({
          message: settings.sms_template,
          target_type: 'outreach',
          total_recipients: 1,
          status: 'sending',
          device_id: selectedDeviceId,
          sim_slot: 1,
          created_by: userData.user?.id ?? null,
        })
        .select()
        .single();
      if (campErr) throw campErr;

      const phone = `+252${t.phone_number.replace(/\D/g, '').replace(/^252/, '')}`;
      const { error: qErr } = await supabase.from('bulk_sms_queue').insert({
        campaign_id: camp.id,
        phone_number: phone,
        device_id: selectedDeviceId,
        sim_slot: 1,
        status: 'pending',
      });
      if (qErr) throw qErr;

      await updateTarget(t.id, {
        status: t.status === 'converted' ? 'converted' : 'messaged',
        contact_method: t.contact_method === 'call' ? 'both' : 'sms',
        contacted_at: new Date().toISOString(),
      });
      toast({ title: isSo ? 'SMS la diray' : 'SMS sent', description: phone });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleConverted = async (t: OutreachTarget) => {
    const ok = await updateTarget(t.id, { status: 'converted', converted_at: new Date().toISOString() });
    if (ok) toast({ title: isSo ? 'Iibsaday ✅' : 'Converted ✅' });
  };

  const handleNotInterested = async (t: OutreachTarget) => {
    const ok = await updateTarget(t.id, { status: 'not_interested' });
    if (ok) toast({ title: isSo ? 'La diiday' : 'Marked not interested' });
  };

  const saveNotes = async (t: OutreachTarget, notes: string) => {
    await updateTarget(t.id, { notes });
  };

  // Follow-up handlers
  const handleFollowUpCall = async (f: FollowUpTarget) => {
    const phone = `+252${f.phone_number.replace(/\D/g, '').replace(/^252/, '')}`;
    window.location.href = `tel:${phone}`;
    const { error } = await supabase.rpc('bump_outreach_follow_up' as any, { p_target_id: f.id });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: isSo ? 'Dib u wac la diiwaangeliyay' : 'Follow-up logged' }); await loadAll(); }
  };

  const handleFollowUpConverted = async (f: FollowUpTarget) => {
    const { error } = await supabase.from('outreach_targets')
      .update({ status: 'converted', converted_at: new Date().toISOString() })
      .eq('id', f.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: isSo ? 'Iibsaday ✅' : 'Converted ✅' }); await loadAll(); }
  };

  const handleFollowUpDismiss = async (f: FollowUpTarget) => {
    const { error } = await supabase.from('outreach_targets')
      .update({ status: 'not_interested' })
      .eq('id', f.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: isSo ? 'La diiday' : 'Dismissed' }); await loadAll(); }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('outreach_settings')
        .update({
          daily_quota: settings.daily_quota,
          sms_template: settings.sms_template,
          cooldown_days: settings.cooldown_days,
          follow_up_days: settings.follow_up_days,
          updated_by: userData.user?.id ?? null,
        } as any)
        .eq('id', settings.id);
      if (error) throw error;
      toast({ title: isSo ? 'La keydiyay' : 'Saved' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSavingSettings(false);
    }
  };

  const quota = settings?.daily_quota ?? 10;
  const contactedToday = targets.filter(t => t.status !== 'pending').length;
  const convertedToday = targets.filter(t => t.status === 'converted').length;
  const progressPct = Math.min(100, Math.round((contactedToday / Math.max(1, quota)) * 100));

  // Stats (last 7 days)
  const stats7 = {
    total: history.length,
    contacted: history.filter(h => h.status !== 'pending').length,
    converted: history.filter(h => h.status === 'converted').length,
  };
  const conversionRate = stats7.contacted > 0 ? Math.round((stats7.converted / stats7.contacted) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold">{isSo ? '📞 Macaamiil-raadis (Outreach)' : '📞 Customer Outreach'}</h2>
          <p className="text-sm text-muted-foreground">
            {isSo ? 'Macaamiisha aan waxba iibsan — wac/SMS u dir oo ku qancii' : 'Reach out to customers who haven\'t purchased yet'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {devices.length > 0 && (
            <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={isSo ? 'Dooro device' : 'Select device'} />
              </SelectTrigger>
              <SelectContent>
                {devices.map(d => (
                  <SelectItem key={d.device_id} value={d.device_id}>{d.device_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={handleGenerate} disabled={generating} variant="default">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {isSo ? 'Soo qaado liis cusub' : 'Generate today\'s list'}
          </Button>
        </div>
      </div>

      {/* Quota Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-sm text-muted-foreground">{isSo ? 'Maanta' : 'Today'}</div>
              <div className="text-2xl font-bold">
                {contactedToday}/{quota} {isSo ? 'la xiriiray' : 'contacted'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">{isSo ? 'Iibsaday' : 'Converted'}</div>
              <div className="text-2xl font-bold text-primary">{convertedToday}</div>
            </div>
          </div>
          <Progress value={progressPct} className="h-2" />
          <div className="text-xs text-muted-foreground mt-2">
            {isSo
              ? `${targets.length} liiska ku jira, ${quota - targets.length > 0 ? quota - targets.length + ' la heli karo' : 'Liiska waa buuxsamay'}`
              : `${targets.length} in list, ${quota - targets.length > 0 ? quota - targets.length + ' available' : 'List complete'}`}
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
        <TabsList className="flex w-full justify-start gap-2 overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 p-1">
          <TabsTrigger value="today" className="shrink-0">{isSo ? 'Maanta' : 'Today'}</TabsTrigger>
          <TabsTrigger value="followup" className="relative shrink-0">
            <BellRing className="h-4 w-4 mr-1" />
            {isSo ? 'Dib u wac' : 'Follow-up'}
            {followUps.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs px-1.5 min-w-5 h-5">
                {followUps.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="shrink-0">{isSo ? 'Taariikh' : 'History'}</TabsTrigger>
          <TabsTrigger value="stats" className="shrink-0"><TrendingUp className="h-4 w-4 mr-1" />{isSo ? 'Tirakoob' : 'Stats'}</TabsTrigger>
          <TabsTrigger value="settings" className="shrink-0"><SettingsIcon className="h-4 w-4 mr-1" />{isSo ? 'Settings' : 'Settings'}</TabsTrigger>
        </TabsList>

        {/* TODAY */}
        <TabsContent value="today" className="space-y-3">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : targets.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                {isSo ? 'Maanta wax liis ah ma jiraan. Riix "Soo qaado liis cusub".' : 'No targets for today. Click "Generate today\'s list".'}
              </CardContent>
            </Card>
          ) : (
            targets.map(t => (
              <TargetCard
                key={t.id}
                target={t}
                isSo={isSo}
                onCall={() => handleCall(t)}
                onSms={() => handleSendSms(t)}
                onConverted={() => handleConverted(t)}
                onNotInterested={() => handleNotInterested(t)}
                onSaveNotes={(notes) => saveNotes(t, notes)}
              />
            ))
          )}
        </TabsContent>

        {/* FOLLOW-UP */}
        <TabsContent value="followup" className="space-y-3">
          {followUps.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                {isSo ? '✅ Wax dib loo wacayo ma jiraan hadda.' : '✅ No follow-ups due right now.'}
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="pt-4 flex items-center gap-3">
                  <BellRing className="h-5 w-5 text-destructive" />
                  <div className="text-sm">
                    <span className="font-bold">{followUps.length}</span>{' '}
                    {isSo
                      ? 'macmiil oo la waco hore weli waxba ma iibsan — dib u wac.'
                      : 'customers were contacted but haven\'t purchased — call them again.'}
                  </div>
                </CardContent>
              </Card>
              {followUps.map(f => (
                <Card key={f.id} className="border-l-4 border-l-destructive">
                  <CardContent className="pt-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-lg font-bold font-mono">{formatPhone(f.phone_number)}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {isSo ? 'Markii hore la waco' : 'Last contacted'}:{' '}
                          {f.contacted_at ? formatDistanceToNow(new Date(f.contacted_at), { addSuffix: true }) : '—'}
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <Badge variant="destructive">
                            {isSo ? `${f.days_overdue} maalmood ka dhaaftay` : `${f.days_overdue}d overdue`}
                          </Badge>
                          <Badge variant="outline">
                            {isSo ? `Wicitaano: ${(f.follow_up_count ?? 0) + 1}` : `Attempts: ${(f.follow_up_count ?? 0) + 1}`}
                          </Badge>
                          <Badge variant="secondary">{f.status}</Badge>
                        </div>
                        {f.notes && <div className="text-xs text-muted-foreground italic">"{f.notes}"</div>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="default" onClick={() => handleFollowUpCall(f)}>
                          <Phone className="h-4 w-4" /> {isSo ? 'Dib u wac' : 'Call again'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleFollowUpConverted(f)}>
                          <CheckCircle2 className="h-4 w-4" /> {isSo ? 'Iibsaday' : 'Converted'}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleFollowUpDismiss(f)}>
                          <XCircle className="h-4 w-4" /> {isSo ? 'Diiday' : 'Dismiss'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </TabsContent>

        {/* HISTORY */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>{isSo ? '7 maalmood ee la soo dhaafay' : 'Last 7 days'}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isSo ? 'Taariikh' : 'Date'}</TableHead>
                    <TableHead>{isSo ? 'Lambar' : 'Phone'}</TableHead>
                    <TableHead>{isSo ? 'Xaalad' : 'Status'}</TableHead>
                    <TableHead>{isSo ? 'Hab' : 'Method'}</TableHead>
                    <TableHead>{isSo ? 'Qoraal' : 'Notes'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">—</TableCell></TableRow>
                  ) : history.map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="text-sm">{h.assigned_date}</TableCell>
                      <TableCell className="font-mono text-sm">{formatPhone(h.phone_number)}</TableCell>
                      <TableCell><Badge variant={statusBadgeVariant(h.status)}>{h.status}</Badge></TableCell>
                      <TableCell className="text-sm">{h.contact_method ?? '—'}</TableCell>
                      <TableCell className="text-sm max-w-[300px] truncate">{h.notes ?? ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* STATS */}
        <TabsContent value="stats">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardDescription>{isSo ? 'Wadarta (7m)' : 'Total (7d)'}</CardDescription></CardHeader>
              <CardContent><div className="text-3xl font-bold">{stats7.total}</div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardDescription>{isSo ? 'La xiriiray' : 'Contacted'}</CardDescription></CardHeader>
              <CardContent><div className="text-3xl font-bold">{stats7.contacted}</div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardDescription>{isSo ? 'Iibsaday' : 'Converted'}</CardDescription></CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">{stats7.converted}</div>
                <div className="text-sm text-muted-foreground">{conversionRate}% {isSo ? 'guul' : 'conversion'}</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* SETTINGS */}
        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>{isSo ? 'Habayn' : 'Settings'}</CardTitle>
              <CardDescription>{isSo ? 'Tirada maalinlaha ah iyo SMS template' : 'Daily quota and SMS template'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!settings ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <div>
                    <Label>{isSo ? 'Tirada maalintii' : 'Daily quota'}</Label>
                    <Select
                      value={String(settings.daily_quota)}
                      onValueChange={(v) => setSettings({ ...settings, daily_quota: parseInt(v) })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[5, 10, 15, 20, 30, 50, 100].map(n => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{isSo ? 'Maalmaha dib-u-wicitaanka' : 'Follow-up window (days)'}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={90}
                      value={settings.follow_up_days ?? 10}
                      onChange={(e) => setSettings({ ...settings, follow_up_days: parseInt(e.target.value || '10') })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {isSo ? 'Haddii macmiilku waxba ma iibsan inta uu mudadan dhammaado, "Dib u wac" ayuu u soo muuqanayaa.' : 'If customer doesn\'t purchase within this window, they appear in "Follow-up".'}
                    </p>
                  </div>
                  <div>
                    <Label>{isSo ? 'Cooldown (maalmood)' : 'Cooldown (days)'}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={settings.cooldown_days}
                      onChange={(e) => setSettings({ ...settings, cooldown_days: parseInt(e.target.value || '30') })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {isSo ? 'Marka la diido, immisa maalmood inta aan dib loo soo qaadin' : 'Days before "not interested" customers re-appear'}
                    </p>
                  </div>
                  <div>
                    <Label>{isSo ? 'SMS Template' : 'SMS template'}</Label>
                    <Textarea
                      rows={4}
                      value={settings.sms_template}
                      onChange={(e) => setSettings({ ...settings, sms_template: e.target.value })}
                    />
                  </div>
                  <Button onClick={saveSettings} disabled={savingSettings}>
                    {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isSo ? 'Keydi' : 'Save'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface TargetCardProps {
  target: OutreachTarget;
  isSo: boolean;
  onCall: () => void;
  onSms: () => void;
  onConverted: () => void;
  onNotInterested: () => void;
  onSaveNotes: (notes: string) => void;
}

function TargetCard({ target, isSo, onCall, onSms, onConverted, onNotInterested, onSaveNotes }: TargetCardProps) {
  const [notes, setNotes] = useState(target.notes ?? '');

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-lg font-bold font-mono">{formatPhone(target.phone_number)}</div>
            <div className="text-xs text-muted-foreground">
              {isSo ? 'Diiwaangashan' : 'Registered'}: {formatDistanceToNow(new Date(target.created_at), { addSuffix: true })}
            </div>
            <Badge variant={statusBadgeVariant(target.status)}>{target.status}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onCall}>
              <Phone className="h-4 w-4" /> {isSo ? 'Wac' : 'Call'}
            </Button>
            <Button size="sm" variant="outline" onClick={onSms}>
              <MessageSquare className="h-4 w-4" /> SMS
            </Button>
            <Button size="sm" variant="default" onClick={onConverted}>
              <CheckCircle2 className="h-4 w-4" /> {isSo ? 'Iibsaday' : 'Converted'}
            </Button>
            <Button size="sm" variant="destructive" onClick={onNotInterested}>
              <XCircle className="h-4 w-4" /> {isSo ? 'Diiday' : 'Not interested'}
            </Button>
          </div>
        </div>
        <div className="mt-3">
          <Textarea
            placeholder={isSo ? 'Qoraal kooban...' : 'Short notes...'}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => { if (notes !== (target.notes ?? '')) onSaveNotes(notes); }}
            rows={2}
            className="text-sm"
          />
        </div>
      </CardContent>
    </Card>
  );
}
