import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Brain, CheckCircle, Trash2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { extractKeywords } from '@/lib/ussdSynonyms';

interface UnmatchedRow {
  id: string;
  flow_id: string | null;
  step_order: number | null;
  dialog_text: string;
  device_id: string | null;
  matched: boolean;
  auto_learned: boolean;
  resolved: boolean;
  created_at: string;
}

interface FlowLite {
  id: string;
  flow_name: string;
  trigger_code: string;
}

interface StepLite {
  id: string;
  flow_id: string;
  step_order: number;
  match_keywords: string[];
}

export default function UssdLearningDashboard() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<UnmatchedRow[]>([]);
  const [flows, setFlows] = useState<FlowLite[]>([]);
  const [steps, setSteps] = useState<StepLite[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [selectedStep, setSelectedStep] = useState<Record<string, string>>({});
  const [keywordDraft, setKeywordDraft] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const [{ data: r }, { data: f }, { data: st }] = await Promise.all([
      supabase.from('ussd_unmatched_dialogs' as any).select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('ussd_flows' as any).select('id, flow_name, trigger_code'),
      supabase.from('ussd_flow_steps' as any).select('id, flow_id, step_order, match_keywords').order('step_order'),
    ]);
    setRows(((r as any[]) || []) as UnmatchedRow[]);
    setFlows(((f as any[]) || []) as FlowLite[]);
    setSteps(((st as any[]) || []) as StepLite[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const stepsForFlow = (flowId: string | null) => steps.filter((s) => s.flow_id === flowId);

  const teachStep = async (rowId: string) => {
    const stepId = selectedStep[rowId];
    const kw = (keywordDraft[rowId] || '').trim();
    if (!stepId || !kw) {
      toast.error('Xulo step & geli keyword');
      return;
    }
    const { error } = await supabase.rpc('learn_ussd_keyword' as any, { _step_id: stepId, _kw: kw });
    if (error) { toast.error(error.message); return; }
    await supabase.rpc('resolve_unmatched_dialog' as any, { _id: rowId, _step_id: stepId });
    toast.success('Keyword-ka waa lagu daray!');
    load();
  };

  const bulkTeachSuggested = async (row: UnmatchedRow) => {
    const stepId = selectedStep[row.id];
    if (!stepId) { toast.error('Xulo step marka hore'); return; }
    const kws = extractKeywords(row.dialog_text).slice(0, 5);
    for (const k of kws) {
      await supabase.rpc('learn_ussd_keyword' as any, { _step_id: stepId, _kw: k });
    }
    await supabase.rpc('resolve_unmatched_dialog' as any, { _id: row.id, _step_id: stepId });
    toast.success(`${kws.length} keywords ayaa la baray`);
    load();
  };

  const del = async (id: string) => {
    if (!confirm('Ka saar diiwaanka?')) return;
    await supabase.from('ussd_unmatched_dialogs' as any).delete().eq('id', id);
    setRows((p) => p.filter((r) => r.id !== id));
  };

  const filtered = rows.filter((r) => showResolved || !r.resolved);

  if (loading) {
    return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Brain className="w-6 h-6 text-primary" /> USSD Learning</h2>
          <p className="text-sm text-muted-foreground">Dialogyada aan la matchin — bar system-ka keywords cusub.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? 'Kaliya kuwa aan la xallin' : 'Muuji dhamaan'}
          </Button>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-1" /> Cusboonaysii</Button>
        </div>
      </div>

      {filtered.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
          Ma jiraan dialogyo aan la matchin. Waa 100% shaqeynayaa!
        </Card>
      )}

      {filtered.map((r) => {
        const flow = flows.find((f) => f.id === r.flow_id);
        const flowSteps = stepsForFlow(r.flow_id);
        const suggested = extractKeywords(r.dialog_text).slice(0, 8);
        return (
          <Card key={r.id} className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={r.resolved ? 'default' : 'destructive'}>{r.resolved ? 'Resolved' : 'Unmatched'}</Badge>
                {r.auto_learned && <Badge variant="secondary">Auto-Learned</Badge>}
                {flow && <Badge variant="outline">{flow.flow_name} ({flow.trigger_code})</Badge>}
                {r.step_order && <Badge variant="outline">Step {r.step_order}</Badge>}
                <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <Button size="icon" variant="ghost" onClick={() => del(r.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
            </div>

            <div className="p-3 rounded bg-muted/50 text-sm font-mono whitespace-pre-wrap">{r.dialog_text}</div>

            <div>
              <div className="text-xs font-semibold mb-1">Keywords la soo jeediyay:</div>
              <div className="flex flex-wrap gap-1">
                {suggested.map((k) => (
                  <Badge key={k} variant="secondary" className="text-xs cursor-pointer"
                    onClick={() => setKeywordDraft((d) => ({ ...d, [r.id]: k }))}>
                    {k}
                  </Badge>
                ))}
              </div>
            </div>

            {!r.resolved && (
              <div className="grid md:grid-cols-3 gap-2 items-end">
                <div>
                  <label className="text-xs">Xulo Step</label>
                  <Select value={selectedStep[r.id] || ''} onValueChange={(v) => setSelectedStep((s) => ({ ...s, [r.id]: v }))}>
                    <SelectTrigger><SelectValue placeholder="Step..." /></SelectTrigger>
                    <SelectContent>
                      {flowSteps.map((s) => (
                        <SelectItem key={s.id} value={s.id}>Step {s.step_order} ({s.match_keywords.slice(0, 2).join(', ')})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs">Keyword cusub</label>
                  <Input value={keywordDraft[r.id] || ''} onChange={(e) => setKeywordDraft((d) => ({ ...d, [r.id]: e.target.value }))} placeholder="tusaale: xaqiiji" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => teachStep(r.id)}><Plus className="w-4 h-4 mr-1" /> Bar</Button>
                  <Button size="sm" variant="secondary" onClick={() => bulkTeachSuggested(r)}>Bar dhamaan</Button>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}