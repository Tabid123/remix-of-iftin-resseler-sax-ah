import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  trigger: React.ReactNode;
}

const ContactDialog = ({ trigger }: Props) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', company: '', message: '' });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.phone.trim() || !form.message.trim()) {
      toast({ title: 'Buuxi meelaha loo baahan yahay', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from('contact_messages').insert({
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      company: form.company.trim() || null,
      message: form.message.trim(),
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Khalad', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Waa la diray', description: 'Waan kula soo xiriiri doonaa dhawaan.' });
    setForm({ full_name: '', phone: '', email: '', company: '', message: '' });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nala soo xiriir</DialogTitle>
          <DialogDescription>Buuxi foomka, kooxdayadu way kula soo xiriiri doontaa.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input placeholder="Magacaaga *" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
          <Input placeholder="Telefoon * (+252-XXXXXXXXX)" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          <Input type="email" placeholder="Email (ikhtiyaari)" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <Input placeholder="Magaca ganacsiga (ikhtiyaari)" value={form.company} onChange={(e) => set('company', e.target.value)} />
          <Textarea rows={4} placeholder="Fariintaada *" value={form.message} onChange={(e) => set('message', e.target.value)} />
          <Button type="submit" className="w-full" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Dir Fariinta
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ContactDialog;
