import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Save, ChevronUp, ChevronDown, Loader2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import AddUssdProviderWizardDialog from './AddUssdProviderWizardDialog';
import { Sparkles } from 'lucide-react';

interface FlowStep {
  id?: string;
  flow_id?: string;
  step_order: number;
  match_keywords: string[];
  response_template: string;
  is_pin_field: boolean;
  _localId: string;
}

interface Flow {
  id: string;
  flow_name: string;
  trigger_code: string;
  is_enabled: boolean;
  notes: string | null;
  steps: FlowStep[];
}

const newLocalId = () => Math.random().toString(36).slice(2);

const emptyStep = (order: number): FlowStep => ({
  step_order: order,
  match_keywords: [],
  response_template: '',
  is_pin_field: false,
  _localId: newLocalId(),
});

export default function UssdFlowsManager() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: flowRows, error: e1 } = await supabase
      .from('ussd_flows' as any)
      .select('*')
      .order('created_at', { ascending: true });
    const { data: stepRows, error: e2 } = await supabase
      .from('ussd_flow_steps' as any)
      .select('*')
      .order('step_order', { ascending: true });
    if (e1 || e2) {
      toast.error('Failed to load flows');
      setLoading(false);
      return;
    }
    const grouped: Flow[] = (flowRows as any[]).map((f) => ({
      id: f.id,
      flow_name: f.flow_name,
      trigger_code: f.trigger_code,
      is_enabled: f.is_enabled,
      notes: f.notes,
      steps: ((stepRows as any[]) || [])
        .filter((s) => s.flow_id === f.id)
        .map((s) => ({
          id: s.id,
          flow_id: s.flow_id,
          step_order: s.step_order,
          match_keywords: s.match_keywords || [],
          response_template: s.response_template || '',
          is_pin_field: s.is_pin_field,
          _localId: s.id,
        })),
    }));
    setFlows(grouped);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const updateFlow = (id: string, patch: Partial<Flow>) => {
    setFlows((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const updateStep = (flowId: string, localId: string, patch: Partial<FlowStep>) => {
    setFlows((prev) =>
      prev.map((f) =>
        f.id === flowId
          ? { ...f, steps: f.steps.map((s) => (s._localId === localId ? { ...s, ...patch } : s)) }
          : f
      )
    );
  };

  const addStep = (flowId: string) => {
    setFlows((prev) =>
      prev.map((f) =>
        f.id === flowId ? { ...f, steps: [...f.steps, emptyStep(f.steps.length + 1)] } : f
      )
    );
  };

  const deleteStep = (flowId: string, localId: string) => {
    setFlows((prev) =>
      prev.map((f) =>
        f.id === flowId
          ? {
              ...f,
              steps: f.steps
                .filter((s) => s._localId !== localId)
                .map((s, i) => ({ ...s, step_order: i + 1 })),
            }
          : f
      )
    );
  };

  const moveStep = (flowId: string, localId: string, dir: -1 | 1) => {
    setFlows((prev) =>
      prev.map((f) => {
        if (f.id !== flowId) return f;
        const idx = f.steps.findIndex((s) => s._localId === localId);
        const target = idx + dir;
        if (idx < 0 || target < 0 || target >= f.steps.length) return f;
        const arr = [...f.steps];
        [arr[idx], arr[target]] = [arr[target], arr[idx]];
        return { ...f, steps: arr.map((s, i) => ({ ...s, step_order: i + 1 })) };
      })
    );
  };

  const createFlow = async () => {
    const { data, error } = await supabase
      .from('ussd_flows' as any)
      .insert({ flow_name: 'New Flow', trigger_code: '*000#', is_enabled: true })
      .select()
      .single();
    if (error || !data) {
      toast.error('Failed to create flow');
      return;
    }
    setFlows((prev) => [
      ...prev,
      {
        id: (data as any).id,
        flow_name: (data as any).flow_name,
        trigger_code: (data as any).trigger_code,
        is_enabled: (data as any).is_enabled,
        notes: (data as any).notes,
        steps: [],
      },
    ]);
    toast.success('Flow created');
  };

  const deleteFlow = async (id: string) => {
    if (!confirm('Delete this flow and all its steps?')) return;
    const { error } = await supabase.from('ussd_flows' as any).delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete');
      return;
    }
    setFlows((prev) => prev.filter((f) => f.id !== id));
    toast.success('Flow deleted');
  };

  const duplicateFlow = async (flow: Flow) => {
    setCopyingId(flow.id);
    try {
      const { data, error } = await supabase
        .from('ussd_flows' as any)
        .insert({
          flow_name: `${flow.flow_name} (Copy)`,
          trigger_code: flow.trigger_code,
          is_enabled: false,
          notes: flow.notes,
        })
        .select()
        .single();
      if (error || !data) throw error || new Error('insert failed');
      const newId = (data as any).id;

      if (flow.steps.length > 0) {
        const rows = flow.steps.map((s, i) => ({
          flow_id: newId,
          step_order: i + 1,
          match_keywords: s.match_keywords,
          response_template: s.response_template,
          is_pin_field: s.is_pin_field,
        }));
        const { error: eIns } = await supabase.from('ussd_flow_steps' as any).insert(rows);
        if (eIns) throw eIns;
      }

      toast.success('Flow-ga waa la nuqulay — badal magaca + trigger code, kadib Enable + Save');
      await load();
    } catch (err: any) {
      toast.error('Copy failed: ' + (err?.message || 'unknown'));
    } finally {
      setCopyingId(null);
    }
  };

  const saveFlow = async (flow: Flow) => {
    setSavingId(flow.id);
    try {
      const { error: e1 } = await supabase
        .from('ussd_flows' as any)
        .update({
          flow_name: flow.flow_name,
          trigger_code: flow.trigger_code,
          is_enabled: flow.is_enabled,
          notes: flow.notes,
        })
        .eq('id', flow.id);
      if (e1) throw e1;

      // replace steps: delete all, re-insert
      const { error: eDel } = await supabase
        .from('ussd_flow_steps' as any)
        .delete()
        .eq('flow_id', flow.id);
      if (eDel) throw eDel;

      if (flow.steps.length > 0) {
        const rows = flow.steps.map((s, i) => ({
          flow_id: flow.id,
          step_order: i + 1,
          match_keywords: s.match_keywords,
          response_template: s.response_template,
          is_pin_field: s.is_pin_field,
        }));
        const { error: eIns } = await supabase.from('ussd_flow_steps' as any).insert(rows);
        if (eIns) throw eIns;
      }

      toast.success('Flow saved');
      await load();
    } catch (err: any) {
      toast.error('Save failed: ' + (err?.message || 'unknown'));
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading flows…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">USSD Interactive Flows</h2>
          <p className="text-muted-foreground text-sm">
            Define dynamic USSD flows with unlimited steps for any provider/code.
          </p>
        </div>
        <Button onClick={createFlow}>
          <Plus className="w-4 h-4 mr-1" /> New Flow
        </Button>
        <Button variant="default" className="ml-2" onClick={() => setWizardOpen(true)}>
          <Sparkles className="w-4 h-4 mr-1" /> Wizard: Ku dar Shirkad Cusub
        </Button>
      </div>

      <AddUssdProviderWizardDialog open={wizardOpen} onOpenChange={setWizardOpen} onCreated={load} />

      {flows.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          No flows yet. Click "New Flow" to create one.
        </Card>
      )}

      {flows.map((flow) => (
        <Card key={flow.id} className="p-5 space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label>Flow Name</Label>
              <Input
                value={flow.flow_name}
                onChange={(e) => updateFlow(flow.id, { flow_name: e.target.value })}
                placeholder="Hormuud *725#"
              />
            </div>
            <div>
              <Label>Trigger USSD Code</Label>
              <Input
                value={flow.trigger_code}
                onChange={(e) => updateFlow(flow.id, { trigger_code: e.target.value })}
                placeholder="*725#"
              />
            </div>
            <div className="flex items-end gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={flow.is_enabled}
                  onCheckedChange={(v) => updateFlow(flow.id, { is_enabled: v })}
                />
                <Label>Enabled</Label>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Steps ({flow.steps.length})</h3>
              <Button size="sm" variant="outline" onClick={() => addStep(flow.id)}>
                <Plus className="w-4 h-4 mr-1" /> Add Step
              </Button>
            </div>

            {flow.steps.map((step, idx) => (
              <Card key={step._localId} className="p-4 bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Step {idx + 1}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => moveStep(flow.id, step._localId, -1)}
                      disabled={idx === 0}
                    >
                      <ChevronUp className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => moveStep(flow.id, step._localId, 1)}
                      disabled={idx === flow.steps.length - 1}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteStep(flow.id, step._localId)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label>Match Keywords (one per line or comma-separated)</Label>
                    <Textarea
                      rows={3}
                      value={step.match_keywords.join('\n')}
                      onChange={(e) =>
                        updateStep(flow.id, step._localId, {
                          match_keywords: e.target.value
                            .split(/[\n,]/)
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder={'enter amount\namount\nlacag'}
                    />
                  </div>
                  <div>
                    <Label>Response (use {`{amount}`}, {`{receiver}`}, {`{pin}`} or text)</Label>
                    <Textarea
                      rows={3}
                      value={step.response_template}
                      onChange={(e) =>
                        updateStep(flow.id, step._localId, { response_template: e.target.value })
                      }
                      placeholder="{amount}"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={step.is_pin_field}
                    onCheckedChange={(v) =>
                      updateStep(flow.id, step._localId, { is_pin_field: v })
                    }
                  />
                  <Label>This step requires the PIN</Label>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex justify-between gap-2 border-t pt-3">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteFlow(flow.id)}
            >
              <Trash2 className="w-4 h-4 mr-1" /> Delete Flow
            </Button>
            <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => duplicateFlow(flow)}
              disabled={copyingId === flow.id}
            >
              {copyingId === flow.id ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Copy className="w-4 h-4 mr-1" />
              )}
              Copy Flow
            </Button>
            <Button onClick={() => saveFlow(flow)} disabled={savingId === flow.id}>
              {savingId === flow.id ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              Save Flow
            </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
