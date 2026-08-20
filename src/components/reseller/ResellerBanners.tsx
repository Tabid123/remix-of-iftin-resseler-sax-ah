import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Power } from 'lucide-react';

interface Banner {
  id: string;
  banner_image: string;
  alt_text: string | null;
  display_order: number;
  is_active: boolean;
  media_type?: string | null;
  rotation_interval?: number | null;
}

export default function ResellerBanners() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ banner_image: '', alt_text: '', display_order: 1, rotation_interval: 5 });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('banners_config').select('*').order('display_order');
    setBanners((data as Banner[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!form.banner_image.trim()) {
      toast({ title: 'Khalad', description: 'Banner URL gali', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('banners_config').insert([{
      banner_image: form.banner_image.trim(),
      alt_text: form.alt_text || null,
      display_order: form.display_order,
      rotation_interval: form.rotation_interval,
      media_type: /\.(mp4|webm|mov)$/i.test(form.banner_image) ? 'video' : 'image',
      is_active: true,
    }]);
    setSaving(false);
    if (error) { toast({ title: 'Khalad', description: error.message, variant: 'destructive' }); return; }
    setForm({ banner_image: '', alt_text: '', display_order: 1, rotation_interval: 5 });
    load();
  };

  const toggle = async (b: Banner) => {
    await supabase.from('banners_config').update({ is_active: !b.is_active }).eq('id', b.id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Ma hubtaa?')) return;
    await supabase.from('banners_config').delete().eq('id', id);
    load();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Ku dar Banner Cusub</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label>Banner URL</Label><Input value={form.banner_image} onChange={(e) => setForm({ ...form, banner_image: e.target.value })} /></div>
            <div><Label>Alt Text</Label><Input value={form.alt_text} onChange={(e) => setForm({ ...form, alt_text: e.target.value })} /></div>
            <div><Label>Display Order</Label><Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 1 })} /></div>
            <div><Label>Rotation (seconds)</Label><Input type="number" value={form.rotation_interval} onChange={(e) => setForm({ ...form, rotation_interval: parseInt(e.target.value) || 5 })} /></div>
          </div>
          <Button onClick={add} className="w-full" disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Ku dar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Banners</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <Table className="mobile-table">
              <TableHeader><TableRow><TableHead>Preview</TableHead><TableHead>Type</TableHead><TableHead>Order</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {banners.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell data-label="Preview">
                      {b.media_type === 'video'
                        ? <video src={b.banner_image} className="h-16 rounded" />
                        : <img src={b.banner_image} alt={b.alt_text || 'Banner'} className="h-16 rounded object-cover" />}
                    </TableCell>
                    <TableCell data-label="Type"><Badge variant="outline">{b.media_type || 'image'}</Badge></TableCell>
                    <TableCell data-label="Order">{b.display_order}</TableCell>
                    <TableCell data-label="Status">{b.is_active ? <span className="text-emerald-600">Active</span> : <span className="text-destructive">Inactive</span>}</TableCell>
                    <TableCell data-label="Falal">
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => toggle(b)}><Power className="h-4 w-4" /></Button>
                        <Button variant="destructive" size="sm" onClick={() => remove(b.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}