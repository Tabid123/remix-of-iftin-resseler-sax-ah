import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Wand2, Plus, Trash2, Loader2, ChevronUp, ChevronDown, Sparkles } from 'lucide-react';
import { extractKeywords } from '@/lib/ussdSynonyms';

interface WizardStep {
  _localId: string;
  dialog_text: string;
  match_keywords: string[];
  response_template: string;
  is_pin_field: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

const uid = () => Math.random().toString(36).slice(2);

const emptyStep = (): WizardStep => ({
  _localId: uid(),
  dialog_text: '',
  match_keywords: [],
  response_template: '',
  is_pin_field: false,
});

type TemplateKey = 'blank' | 'somtel' | 'hormuud';
const TEMPLATES: Record<TemplateKey, { trigger: string; steps: Omit<WizardStep, '_localId'>[] }> = {
  blank: { trigger: '*000#', steps: [{ ...emptyStep() }].map(({ _localId, ...r }) => r) },
  somtel: {
    trigger: '*300#',
    steps: [
      { dialog_text: 'Select an option', match_keywords: ['select', 'option', 'menu'], response_template: '3', is_pin_field: false },
      { dialog_text: 'Enter receiver number', match_keywords: ['receiver', 'number', 'lambar'], response_template: '{receiver}', is_pin_field: false },
      { dialog_text: 'Enter amount', match_keywords: ['amount', 'lacag', 'qiimo'], response_template: '{amount}', is_pin_field: false },
      { dialog_text: 'Enter PIN', match_keywords: ['pin', 'sirta', 'furaha'], response_template: '{pin}', is_pin_field: true },
    ],
  },
  hormuud: {
    trigger: '*712#',
    steps: [
      { dialog_text: 'Choose service', match_keywords: ['choose', 'service', 'menu'], response_template: '1', is_pin_field: false },
      { dialog_text: 'Enter phone number', match_keywords: ['phone', 'number', 'lambar'], response_template: '{receiver}', is_pin_field: false },
      { dialog_text: 'Enter amount', match_keywords: ['amount', 'lacag'], response_template: '{amount}', is_pin_field: false },
      { dialog_text: 'Enter PIN', match_keywords: ['pin', 'sirta'], response_template: '{pin}', is_pin_field: true },
      { dialog_text: 'Confirm', match_keywords: ['confirm', 'xaqiiji'], response_template: '1', is_pin_field: false },
    ],
  },
};

export default function AddUssdProviderWizardDialog({ open, onOpenChange, onCreated }: Props) {
  const [tab, setTab] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);

  // Tab 1
  const [providerName, setProviderName] = useState('');
  const [providerLogo, setProviderLogo] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [evoucherRate, setEvoucherRate] = useState(0);
  const [simPassword, setSimPassword] = useState('');
  const [triggerCode, setTriggerCode] = useState('*000#');
  const [template, setTemplate] = useState<TemplateKey>('blank');

  // Tab 2
  const [steps, setSteps] = useState<WizardStep[]>([emptyStep()]);

  const reset = () => {
    setTab(1); setProviderName(''); setProviderLogo(''); setDisplayOrder(0);
    setEvoucherRate(0); setSimPassword(''); setTriggerCode('*000#');
    setTemplate('blank'); setSteps([emptyStep()]);
  };

  const applyTemplate = (key: TemplateKey) => {
    setTemplate(key);
    const t = TEMPLATES[key];
    setTriggerCode(t.trigger);
    setSteps(t.steps.map((s) => ({ ...s, _localId: uid() })));
  };

  const updateStep = (id: string, patch: Partial<WizardStep>) => {
    setSteps((prev) => prev.map((s) => (s._localId === id ? { ...s, ...patch } : s)));
  };
  const addStep = () => setSteps((prev) => [...prev, emptyStep()]);
  const removeStep = (id: string) => setSteps((prev) => prev.filter((s) => s._localId !== id));
  const moveStep = (id: string, dir: -1 | 1) => {
    setSteps((prev) => {
      const i = prev.findIndex((s) => s._localId === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const arr = [...prev];
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  };

  const autoDetect = (id: string) => {
    const s = steps.find((x) => x._localId === id);
    if (!s) return;
    const kws = extractKeywords(s.dialog_text);
    if (!kws.length) {
      toast.warning('Ma helin ereyo — geli qoraalka dialog-ga marka hore');
      return;
    }
    const merged = Array.from(new Set([...(s.match_keywords || []), ...kws]));
    updateStep(id, { match_keywords: merged });
    toast.success(`${kws.length} keywords ayaa la helay`);
  };

  const canGoNext = () => {
    if (tab === 1) return providerName.trim().length > 0 && triggerCode.trim().length > 0 && simPassword.trim().length >= 4;
    if (tab === 2) return steps.length > 0 && steps.every((s) => s.match_keywords.length > 0 && s.response_template.trim().length > 0);
    return true;
  };

  const save = async () => {
    setSaving(true);
    let flowId: string | null = null;
    try {
      // 1) create flow
      const { data: flow, error: e1 } = await supabase
        .from('ussd_flows' as any)
        .insert({ flow_name: `${providerName} ${triggerCode}`, trigger_code: triggerCode, is_enabled: true })
        .select().single();
      if (e1 || !flow) throw e1 || new Error('Flow create failed');
      flowId = (flow as any).id;

      // 2) create steps
      const rows = steps.map((s, i) => ({
        flow_id: flowId,
        step_order: i + 1,
        match_keywords: s.match_keywords,
        response_template: s.response_template,
        is_pin_field: s.is_pin_field,
      }));
      const { error: e2 } = await supabase.from('ussd_flow_steps' as any).insert(rows);
      if (e2) throw e2;

      // 3) create provider linked to this flow
      const { error: e3 } = await supabase.from('providers_config').insert([{
        provider_name: providerName,
        provider_logo: providerLogo || null,
        display_order: displayOrder,
        evoucher_rate: evoucherRate,
        sim_password: simPassword,
        ussd_method: 'interactive',
        ussd_flow_id: flowId,
        is_active: true,
        promotional_text: 'Iftin ka iibso Internet adigoona qof wicin, waqti kasta, xitaa offline!',
      }] as any);
      if (e3) throw e3;

      toast.success('Shirkada USSD si guul leh ayaa loo daray!');
      onCreated?.();
      onOpenChange(false);
      reset();
    } catch (err: any) {
      // rollback flow if provider failed
      if (flowId) {
        await supabase.from('ussd_flows' as any).delete().eq('id', flowId);
      }
      toast.error('Fashilmay: ' + (err?.message || 'khalad'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Wizard Cusub — Ku dar Shirkad USSD
          </DialogTitle>
        </DialogHeader>

        {/* stepper */}
        <div className="flex items-center gap-2 mb-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`flex-1 h-2 rounded ${tab >= n ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        {tab === 1 && (
          <div className="space-y-4">
            <h3 className="font-semibold">Tallaabo 1 — Xogta Shirkada</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>Magaca Shirkada *</Label>
                <Input value={providerName} onChange={(e) => setProviderName(e.target.value)} placeholder="Somnet, Amtel..." />
              </div>
              <div>
                <Label>Logo URL (ikhtiyaari)</Label>
                <Input value={providerLogo} onChange={(e) => setProviderLogo(e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <Label>Display Order</Label>
                <Input type="number" value={displayOrder} onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <Label>E-voucher Rate (%)</Label>
                <Input type="number" value={evoucherRate} onChange={(e) => setEvoucherRate(parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label>SIM PIN (4-digit) *</Label>
                <Input value={simPassword} onChange={(e) => setSimPassword(e.target.value)} placeholder="1234" maxLength={6} />
              </div>
              <div>
                <Label>Trigger USSD Code *</Label>
                <Input value={triggerCode} onChange={(e) => setTriggerCode(e.target.value)} placeholder="*300#" />
              </div>
              <div className="md:col-span-2">
                <Label>Template Bilow ah</Label>
                <Select value={template} onValueChange={(v) => applyTemplate(v as TemplateKey)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blank">Faaruq (bilow banaan)</SelectItem>
                    <SelectItem value="somtel">Somtel *300# (4 steps)</SelectItem>
                    <SelectItem value="hormuud">Hormuud *712# (5 steps)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Template-ka wuxuu buuxinayaa steps-ka Tallaabada 2-aad.</p>
              </div>
            </div>
          </div>
        )}

        {tab === 2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Tallaabo 2 — USSD Steps ({steps.length})</h3>
              <Button size="sm" variant="outline" onClick={addStep}><Plus className="w-4 h-4 mr-1" /> Step cusub</Button>
            </div>
            {steps.map((s, idx) => (
              <Card key={s._localId} className="p-3 space-y-2 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Step {idx + 1}</Badge>
                    <Button size="icon" variant="ghost" onClick={() => moveStep(s._localId, -1)} disabled={idx === 0}><ChevronUp className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => moveStep(s._localId, 1)} disabled={idx === steps.length - 1}><ChevronDown className="w-4 h-4" /></Button>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeStep(s._localId)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
                <div>
                  <Label>Qoraalka Dialog-ga (copy-paste)</Label>
                  <Textarea rows={2} value={s.dialog_text} onChange={(e) => updateStep(s._localId, { dialog_text: e.target.value })}
                    placeholder="Enter amount to send:" />
                </div>
                <Button size="sm" variant="secondary" onClick={() => autoDetect(s._localId)}>
                  <Wand2 className="w-4 h-4 mr-1" /> 🪄 Auto-Detect Keywords
                </Button>
                <div>
                  <Label>Match Keywords ({s.match_keywords.length})</Label>
                  <Textarea rows={2} value={s.match_keywords.join(', ')}
                    onChange={(e) => updateStep(s._localId, { match_keywords: e.target.value.split(/[\n,]/).map((x) => x.trim()).filter(Boolean) })}
                    placeholder="amount, lacag, qiimo" />
                </div>
                <div>
                  <Label>Response Template</Label>
                  <Input value={s.response_template} onChange={(e) => updateStep(s._localId, { response_template: e.target.value })}
                    placeholder="{amount} ama {receiver} ama {pin} ama '1'" />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={s.is_pin_field} onCheckedChange={(v) => updateStep(s._localId, { is_pin_field: v })} />
                  <Label>Step-kan waxa loo baahan yahay PIN (HARD-STOP manual)</Label>
                </div>
              </Card>
            ))}
          </div>
        )}

        {tab === 3 && (
          <div className="space-y-3">
            <h3 className="font-semibold">Tallaabo 3 — Faahfaahin & Kaydinta</h3>
            <Card className="p-4 space-y-2">
              <div><b>Shirkada:</b> {providerName}</div>
              <div><b>Trigger USSD:</b> {triggerCode}</div>
              <div><b>SIM PIN:</b> {'•'.repeat(simPassword.length)}</div>
              <div><b>E-voucher Rate:</b> {evoucherRate}%</div>
              <div><b>Steps ({steps.length}):</b>
                <ul className="text-sm mt-1 space-y-1">
                  {steps.map((s, i) => (
                    <li key={s._localId}>• Step {i + 1}: {s.response_template} {s.is_pin_field && <Badge variant="destructive" className="text-xs">PIN</Badge>} — {s.match_keywords.slice(0, 3).join(', ')}{s.match_keywords.length > 3 ? '…' : ''}</li>
                  ))}
                </ul>
              </div>
            </Card>
            <p className="text-xs text-muted-foreground">
              Marka aad kaydiso, si automatic ah shirkada ayaa loo hawlgelinayaa. Android-ka wuxuu si toos ah u qaadanayaa flow-ga cusub 5 daqiiqo gudahood.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {tab > 1 && <Button variant="outline" onClick={() => setTab((tab - 1) as 1 | 2 | 3)}>Dib u noqo</Button>}
          {tab < 3 && <Button onClick={() => setTab((tab + 1) as 1 | 2 | 3)} disabled={!canGoNext()}>Xiga →</Button>}
          {tab === 3 && (
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
              Kaydi & Hawlgeli
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}