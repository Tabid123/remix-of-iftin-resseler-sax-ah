import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Trash2, Check } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ContactMessage {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  company: string | null;
  message: string;
  status: string;
  created_at: string;
}

const ContactMessagesTab = () => {
  const [rows, setRows] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('contact_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) toast({ title: 'Khalad', description: error.message, variant: 'destructive' });
    setRows((data ?? []) as ContactMessage[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => {
    await (supabase as any).from('contact_messages').update({ status: 'read' }).eq('id', id);
    setRows((r) => r.map((x) => (x.id === id ? { ...x, status: 'read' } : x)));
  };

  const remove = async (id: string) => {
    await (supabase as any).from('contact_messages').delete().eq('id', id);
    setRows((r) => r.filter((x) => x.id !== id));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>📨 Nala Soo Xiriir ({rows.length})</CardTitle>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-2 h-4 w-4" /> Cusboonaysii
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Wax fariin ah ma jiraan weli.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">Taariikh</th>
                  <th className="p-2">Magaca</th>
                  <th className="p-2">Telefoon</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Shirkad</th>
                  <th className="p-2">Fariin</th>
                  <th className="p-2">Xaalad</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b align-top">
                    <td className="whitespace-nowrap p-2">
                      {new Date(r.created_at).toLocaleString('en-US', { timeZone: 'Africa/Mogadishu' })}
                    </td>
                    <td className="p-2 font-medium">{r.full_name}</td>
                    <td className="whitespace-nowrap p-2">{r.phone}</td>
                    <td className="p-2">{r.email || '-'}</td>
                    <td className="p-2">{r.company || '-'}</td>
                    <td className="max-w-sm p-2">{r.message}</td>
                    <td className="p-2">
                      <Badge variant={r.status === 'new' ? 'default' : 'secondary'}>{r.status}</Badge>
                    </td>
                    <td className="whitespace-nowrap p-2">
                      {r.status === 'new' && (
                        <Button variant="ghost" size="icon" onClick={() => markRead(r.id)}>
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => remove(r.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ContactMessagesTab;
