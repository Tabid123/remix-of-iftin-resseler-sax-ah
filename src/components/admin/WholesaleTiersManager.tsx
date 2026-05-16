import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Pencil, Plus, Trash2 } from 'lucide-react';

interface Provider { id: string; provider_name: string; }
interface Tier {
  id: string;
  provider_id: string;
  tier_name: string;
  min_amount: number;
  max_amount: number;
  profit_rate: number;
  display_order: number;
  is_active: boolean;
}

const emptyForm = {
  provider_id: '',
  tier_name: 'Jumlo',
  min_amount: '',
  max_amount: '',
  profit_rate: '',
  display_order: '0',
  is_active: true,
};

export default function WholesaleTiersManager() {
  const { toast } = useToast();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    const [{ data: pr }, { data: tr }] = await Promise.all([
      supabase.from('providers_config').select('id, provider_name').eq('is_active', true).order('display_order'),
      supabase.from('provider_wholesale_tiers').select('*').order('display_order').order('min_amount'),
    ]);
    setProviders(pr || []);
    setTiers((tr as Tier[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditingId(null);
    setForm({ ...emptyForm, provider_id: providers[0]?.id || '' });
    setDialogOpen(true);
  };

  const openEdit = (t: Tier) => {
    setEditingId(t.id);
    setForm({
      provider_id: t.provider_id,
      tier_name: t.tier_name,
      min_amount: String(t.min_amount),
      max_amount: String(t.max_amount),
      profit_rate: String(t.profit_rate),
      display_order: String(t.display_order),
      is_active: t.is_active,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    const min = parseFloat(form.min_amount);
    const max = parseFloat(form.max_amount);
    const rate = parseFloat(form.profit_rate);
    const order = parseInt(form.display_order || '0', 10);

    if (!form.provider_id) return toast({ title: 'Dooro shirkad', variant: 'destructive' });
    if (!form.tier_name.trim()) return toast({ title: 'Geli magaca tier-ka', variant: 'destructive' });
    if (isNaN(min) || isNaN(max) || isNaN(rate)) return toast({ title: 'Geli qiimayaal sax ah', variant: 'destructive' });
    if (min < 0 || max <= min) return toast({ title: 'Max waa inuu ka weynaado Min', variant: 'destructive' });
    if (rate < 0) return toast({ title: 'Profit rate ha noqdo >= 0', variant: 'destructive' });

    const payload = {
      provider_id: form.provider_id,
      tier_name: form.tier_name.trim(),
      min_amount: min,
      max_amount: max,
      profit_rate: rate,
      display_order: order,
      is_active: form.is_active,
    };

    const res = editingId
      ? await supabase.from('provider_wholesale_tiers').update(payload).eq('id', editingId)
      : await supabase.from('provider_wholesale_tiers').insert(payload);

    if (res.error) return toast({ title: 'Khalad', description: res.error.message, variant: 'destructive' });
    toast({ title: editingId ? 'Waa la cusbooneysiiyay' : 'Waa la abuuray' });
    setDialogOpen(false);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('provider_wholesale_tiers').delete().eq('id', id);
    if (error) return toast({ title: 'Khalad', description: error.message, variant: 'destructive' });
    toast({ title: 'Waa la tirtiray' });
    load();
  };

  const toggleActive = async (t: Tier) => {
    const { error } = await supabase.from('provider_wholesale_tiers')
      .update({ is_active: !t.is_active }).eq('id', t.id);
    if (error) return toast({ title: 'Khalad', description: error.message, variant: 'destructive' });
    load();
  };

  const providerName = (id: string) => providers.find(p => p.id === id)?.provider_name || '—';
  const filteredTiers = filterProvider === 'all' ? tiers : tiers.filter(t => t.provider_id === filterProvider);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle>📊 Wholesale Tiers (Jumlo)</CardTitle>
          <CardDescription>Maamul min, max, iyo profit rate-ka shirkad walba</CardDescription>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={filterProvider} onValueChange={setFilterProvider}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Dhammaan Shirkadaha</SelectItem>
              {providers.map(p => <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Tier Cusub</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit Tier' : 'Tier Cusub'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Shirkadda</Label>
                  <Select value={form.provider_id} onValueChange={(v) => setForm({ ...form, provider_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Dooro shirkad" /></SelectTrigger>
                    <SelectContent>
                      {providers.map(p => <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Magaca Tier-ka</Label>
                  <Input value={form.tier_name} onChange={(e) => setForm({ ...form, tier_name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Min Amount ($)</Label>
                    <Input type="number" step="0.01" value={form.min_amount}
                      onChange={(e) => setForm({ ...form, min_amount: e.target.value })} />
                  </div>
                  <div>
                    <Label>Max Amount ($)</Label>
                    <Input type="number" step="0.01" value={form.max_amount}
                      onChange={(e) => setForm({ ...form, max_amount: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Profit Rate (%)</Label>
                    <Input type="number" step="0.01" value={form.profit_rate}
                      onChange={(e) => setForm({ ...form, profit_rate: e.target.value })} />
                  </div>
                  <div>
                    <Label>Display Order</Label>
                    <Input type="number" value={form.display_order}
                      onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                  <Label>Active</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Jooji</Button>
                <Button onClick={save}>Kaydi</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : filteredTiers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">Wax tier ah ma jiraan. Riix "Tier Cusub" si aad u abuurto.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shirkad</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Min</TableHead>
                <TableHead>Max</TableHead>
                <TableHead>Rate %</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Falal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTiers.map(t => (
                <TableRow key={t.id}>
                  <TableCell>{providerName(t.provider_id)}</TableCell>
                  <TableCell>{t.tier_name}</TableCell>
                  <TableCell>${Number(t.min_amount).toFixed(2)}</TableCell>
                  <TableCell>${Number(t.max_amount).toFixed(2)}</TableCell>
                  <TableCell>{Number(t.profit_rate).toFixed(2)}%</TableCell>
                  <TableCell>{t.display_order}</TableCell>
                  <TableCell>
                    <Switch checked={t.is_active} onCheckedChange={() => toggleActive(t)} />
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="destructive"><Trash2 className="w-3 h-3" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Tirtir tier-kan?</AlertDialogTitle>
                          <AlertDialogDescription>Tani lama soo celin karo.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Maya</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(t.id)}>Haa, tirtir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
