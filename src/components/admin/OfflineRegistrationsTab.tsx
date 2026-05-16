import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchAllRows } from '@/utils/fetchAllRows';
import { toast } from '@/hooks/use-toast';
import { Loader2, Phone, Power, Trash2, Pencil, UserPlus, WifiOff, Save, Search } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface Provider {
  id: string;
  provider_name: string;
  is_active: boolean;
}

interface OfflineRegistration {
  id: string;
  sender_phone: string;
  receiver_phone: string;
  provider_id: string | null;
  provider_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface OfflineRegistrationsTabProps {
  providers: Provider[];
}

export const OfflineRegistrationsTab = ({ providers }: OfflineRegistrationsTabProps) => {
  const { language } = useLanguage();
  const [registrations, setRegistrations] = useState<OfflineRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'today'>('all');
  const [search, setSearch] = useState('');
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newSenderPhone, setNewSenderPhone] = useState('');
  const [newReceiverPhone, setNewReceiverPhone] = useState('');
  const [newProvider, setNewProvider] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingReg, setEditingReg] = useState<OfflineRegistration | null>(null);
  const [editSenderPhone, setEditSenderPhone] = useState('');
  const [editReceiverPhone, setEditReceiverPhone] = useState('');
  const [editProvider, setEditProvider] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    loadRegistrations();
  }, []);

  const normalizePhoneInput = (value: string) => value.replace(/\D/g, '').replace(/^252/, '').slice(0, 9);

  const loadRegistrations = async () => {
    setLoading(true);
    try {
      const data = await fetchAllRows<OfflineRegistration>(() =>
        supabase.from('offline_registrations').select('*').order('created_at', { ascending: false })
      );
      setRegistrations(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  const totalRegs = registrations.length;
  const activeRegs = registrations.filter(r => r.is_active).length;
  const inactiveRegs = registrations.filter(r => !r.is_active).length;
  const todayRegs = registrations.filter(r => new Date(r.created_at) >= startOfToday).length;

  const getFiltered = () => {
    let filtered = registrations;
    if (filter === 'active') filtered = filtered.filter(r => r.is_active);
    else if (filter === 'inactive') filtered = filtered.filter(r => !r.is_active);
    else if (filter === 'today') filtered = filtered.filter(r => new Date(r.created_at) >= startOfToday);
    if (search) filtered = filtered.filter(r => r.sender_phone.includes(search) || r.receiver_phone.includes(search));
    return filtered;
  };

  const filteredRegs = getFiltered();

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase.from('offline_registrations').update({ is_active: !currentStatus }).eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
    else { setRegistrations(prev => prev.map(r => r.id === id ? { ...r, is_active: !r.is_active } : r)); }
  };

  const deleteReg = async (id: string) => {
    if (!confirm(language === 'so' ? 'Ma hubtaa?' : 'Are you sure?')) return;
    const { error } = await supabase.from('offline_registrations').delete().eq('id', id);
    if (!error) setRegistrations(prev => prev.filter(r => r.id !== id));
  };

  const addRegistration = async () => {
    if (!newSenderPhone || !newReceiverPhone || !newProvider) {
      toast({ title: 'Error', description: 'Fill all fields', variant: 'destructive' });
      return;
    }

    if (newSenderPhone.length !== 9 || newReceiverPhone.length !== 9) {
      toast({
        title: 'Error',
        description: language === 'so' ? 'Lambarradu waa inay noqdaan 9 digit' : 'Phone numbers must be 9 digits',
        variant: 'destructive'
      });
      return;
    }

    setIsAdding(true);
    const provider = providers.find(p => p.provider_name === newProvider);
    const payload = {
      sender_phone: newSenderPhone,
      receiver_phone: newReceiverPhone,
      provider_name: newProvider,
      provider_id: provider?.id || null,
      is_active: true,
    };
    const { data, error } = await supabase
      .from('offline_registrations')
      .upsert(payload, { onConflict: 'sender_phone' })
      .select()
      .single();

    setIsAdding(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    if (data) {
      setRegistrations(prev => {
        const exists = prev.some(reg => reg.id === (data as OfflineRegistration).id);
        if (exists) {
          return prev.map(reg => reg.id === (data as OfflineRegistration).id ? data as OfflineRegistration : reg);
        }
        return [data as OfflineRegistration, ...prev];
      });
      setNewSenderPhone(''); setNewReceiverPhone(''); setNewProvider('');
      setShowAddDialog(false);
      toast({ title: 'Success', description: language === 'so' ? 'Waa la diiwaangeliyay' : 'Registered' });
    }
  };

  const updateRegistration = async () => {
    if (!editingReg) return;
    setIsEditing(true);
    const provider = providers.find(p => p.provider_name === editProvider);
    const { error } = await supabase.from('offline_registrations').update({ sender_phone: editSenderPhone, receiver_phone: editReceiverPhone, provider_name: editProvider, provider_id: provider?.id || null }).eq('id', editingReg.id);
    setIsEditing(false);
    if (!error) {
      setRegistrations(prev => prev.map(r => r.id === editingReg.id ? { ...r, sender_phone: editSenderPhone, receiver_phone: editReceiverPhone, provider_name: editProvider, provider_id: provider?.id || null } : r));
      setShowEditDialog(false);
      toast({ title: 'Success', description: language === 'so' ? 'Waa la cusbooneysiiyay' : 'Updated' });
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold">{totalRegs}</p><p className="text-sm text-muted-foreground">Total</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold text-green-600">{activeRegs}</p><p className="text-sm text-muted-foreground">Active</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold text-orange-600">{inactiveRegs}</p><p className="text-sm text-muted-foreground">Inactive</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold text-blue-600">{todayRegs}</p><p className="text-sm text-muted-foreground">{language === 'so' ? 'Maanta' : 'Today'}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><WifiOff className="h-5 w-5" /> Offline Registration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>All ({totalRegs})</Button>
              <Button variant={filter === 'active' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('active')}>Active ({activeRegs})</Button>
              <Button variant={filter === 'inactive' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('inactive')}>Inactive ({inactiveRegs})</Button>
              <Button variant={filter === 'today' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('today')}>{language === 'so' ? 'Maanta' : 'Today'} ({todayRegs})</Button>
              <Button onClick={() => setShowAddDialog(true)} size="sm"><UserPlus className="h-4 w-4 mr-2" /> {language === 'so' ? 'Cusub' : 'Add'}</Button>
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Sender</TableHead>
                  <TableHead>Receiver</TableHead>
                  <TableHead>{language === 'so' ? 'Shirkad' : 'Provider'}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>{language === 'so' ? 'Taarikh' : 'Date'}</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRegs.map((reg, i) => (
                  <TableRow key={reg.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell><span className="font-mono">+252{reg.sender_phone}</span></TableCell>
                    <TableCell><span className="font-mono">+252{reg.receiver_phone}</span></TableCell>
                    <TableCell><Badge variant="outline">{reg.provider_name}</Badge></TableCell>
                    <TableCell><Badge variant={reg.is_active ? "default" : "secondary"} className={reg.is_active ? "bg-emerald-500" : ""}>{reg.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(reg.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => { setEditingReg(reg); setEditSenderPhone(reg.sender_phone); setEditReceiverPhone(reg.receiver_phone); setEditProvider(reg.provider_name); setShowEditDialog(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="outline" size="sm" onClick={() => toggleStatus(reg.id, reg.is_active)}><Power className="h-4 w-4" /></Button>
                        <Button variant="destructive" size="sm" onClick={() => deleteReg(reg.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredRegs.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No registrations found</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>{language === 'so' ? 'Diiwaangeli Cusub' : 'Register New'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
               <Label>Sender Phone</Label>
               <div className="flex items-center"><span className="text-sm bg-muted px-3 py-2 rounded-l-md border border-r-0">+252</span><Input placeholder="61xxxxxxx" value={newSenderPhone} onChange={(e) => setNewSenderPhone(normalizePhoneInput(e.target.value))} maxLength={9} className="rounded-l-none" /></div>
            </div>
            <div className="grid gap-2">
              <Label>Receiver Phone</Label>
               <div className="flex items-center"><span className="text-sm bg-muted px-3 py-2 rounded-l-md border border-r-0">+252</span><Input placeholder="61xxxxxxx" value={newReceiverPhone} onChange={(e) => setNewReceiverPhone(normalizePhoneInput(e.target.value))} maxLength={9} className="rounded-l-none" /></div>
            </div>
            <div className="grid gap-2">
              <Label>Provider</Label>
              <Select value={newProvider} onValueChange={setNewProvider}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>{providers.filter(p => p.is_active).map(p => <SelectItem key={p.id} value={p.provider_name}>{p.provider_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={addRegistration} disabled={isAdding}>{isAdding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}{language === 'so' ? 'Diiwaangeli' : 'Register'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>{language === 'so' ? 'Edit Registration' : 'Edit Registration'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
               <Label>Sender Phone</Label>
               <div className="flex items-center"><span className="text-sm bg-muted px-3 py-2 rounded-l-md border border-r-0">+252</span><Input value={editSenderPhone} onChange={(e) => setEditSenderPhone(normalizePhoneInput(e.target.value))} maxLength={9} className="rounded-l-none" /></div>
            </div>
            <div className="grid gap-2">
              <Label>Receiver Phone</Label>
               <div className="flex items-center"><span className="text-sm bg-muted px-3 py-2 rounded-l-md border border-r-0">+252</span><Input value={editReceiverPhone} onChange={(e) => setEditReceiverPhone(normalizePhoneInput(e.target.value))} maxLength={9} className="rounded-l-none" /></div>
            </div>
            <div className="grid gap-2">
              <Label>Provider</Label>
              <Select value={editProvider} onValueChange={setEditProvider}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{providers.filter(p => p.is_active).map(p => <SelectItem key={p.id} value={p.provider_name}>{p.provider_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={updateRegistration} disabled={isEditing}>{isEditing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
