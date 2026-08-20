import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Building2 } from "lucide-react";
import ProviderClonePicker from "./ProviderClonePicker";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}

const slugify = (v: string) =>
  v.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function CreateResellerDialog({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [primary, setPrimary] = useState("#0f172a");
  const [secondary, setSecondary] = useState("#ffffff");
  const [providers, setProviders] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName(""); setSlug(""); setEmail(""); setPassword("");
    setPrimary("#0f172a"); setSecondary("#ffffff"); setProviders([]);
  };

  const submit = async () => {
    if (!name.trim() || !slug.trim() || !email.trim() || password.length < 6) {
      toast.error("Buuxi magaca, slug, email iyo password (6+)");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("superadmin-tenants", {
        body: {
          action: "create",
          name: name.trim(),
          slug: slugify(slug),
          email: email.trim(),
          password,
          primary_color: primary,
          secondary_color: secondary,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Lama abuurin");

      const tenantId = data.tenant?.id as string;
      if (providers.length > 0 && tenantId) {
        const { data: res, error: rpcErr } = await supabase.rpc("clone_tenant_providers", {
          _target_tenant: tenantId,
          _provider_names: providers,
        } as any);
        if (rpcErr) {
          toast.error(`Reseller waa la abuuray, laakiin shirkadaha lama koobiyeyn: ${rpcErr.message}`);
        } else {
          const r: any = res ?? {};
          toast.success(
            `Reseller waa la abuuray — shirkado ${r.providers ?? 0}, xirmooyin ${r.packages ?? 0}, flows ${r.flows ?? 0}`
          );
        }
      } else {
        toast.success("Reseller waa la abuuray");
      }
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Reseller cusub
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Magaca ganacsiga</Label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slug || slug === slugify(name)) setSlug(slugify(e.target.value));
              }}
              placeholder="Najax Data"
            />
          </div>
          <div className="space-y-2">
            <Label>Slug (link)</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="najax" className="font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Email admin</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Primary color</Label>
              <Input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-10 p-1" />
            </div>
            <div className="space-y-2">
              <Label>Secondary color</Label>
              <Input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="h-10 p-1" />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Shirkadaha la koobiyeynayo</Label>
            <p className="text-xs text-muted-foreground">
              Flows-ka USSD, qaybaha, xirmooyinka, SIM PIN iyo wholesale tiers si otomaatig ah ayaa loo koobiyeeyaa.
            </p>
            <ProviderClonePicker selected={providers} onChange={setProviders} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Jooji</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Abuur reseller
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
