import { useEffect, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function TenantSetupDialog({ open, onOpenChange }: Props) {
  const { tenant, refreshTenants } = useTenant();
  const [name, setName] = useState('');
  const [primary, setPrimary] = useState('#000000');
  const [secondary, setSecondary] = useState('#ffffff');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenant) return;
    setName(tenant.name ?? '');
    setPrimary(tenant.primary_color || '#000000');
    setSecondary(tenant.secondary_color || '#ffffff');
  }, [tenant?.id]);

  const handleSave = async () => {
    if (!tenant) return;
    if (!name.trim()) {
      toast({ title: 'Magaca ganacsiga waa loo baahan yahay', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      let logoPath = tenant.logo_url;

      if (file) {
        const path = `${tenant.id}/logo.png`;
        const { error: upErr } = await supabase.storage
          .from('tenant-logos')
          .upload(path, file, { upsert: true, contentType: file.type || 'image/png' });
        if (upErr) throw upErr;
        logoPath = path;
      }

      const { error } = await supabase
        .from('tenants')
        .update({
          name: name.trim(),
          logo_url: logoPath,
          primary_color: primary,
          secondary_color: secondary,
        } as any)
        .eq('id', tenant.id);
      if (error) throw error;

      await refreshTenants();
      toast({ title: 'Workspace-ka waa la cusboonaysiiyay' });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Setup your workspace</DialogTitle>
          <DialogDescription>Magaca, logo-ga iyo midabada ganacsigaaga dejiso.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tenant-name">Magaca Brand-ka / Company-ga</Label>
            <Input id="tenant-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Iftin Agents" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenant-logo">Logo</Label>
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <Input
                id="tenant-logo"
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primary-color">Primary Color</Label>
              <Input id="primary-color" type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-10 p-1" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secondary-color">Secondary Color</Label>
              <Input id="secondary-color" type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="h-10 p-1" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Ka bax</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Kaydi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}