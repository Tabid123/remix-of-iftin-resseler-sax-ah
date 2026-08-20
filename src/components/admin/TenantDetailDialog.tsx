import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, Link2, Lock, Loader2, Ban, CheckCircle2, Trash2, KeyRound } from "lucide-react";
import { PackagePlus } from "lucide-react";
import ProviderClonePicker from "./ProviderClonePicker";

interface Props {
  tenantId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}

interface CredRow {
  id: string;
  user_id: string | null;
  email: string;
  initial_password: string | null;
  last_sign_in_at: string | null;
  banned: boolean;
}

interface MemberRow {
  user_id: string;
  role: string;
  email: string | null;
  last_sign_in_at: string | null;
  banned: boolean;
}

const PUBLIC_BASE = "https://iftinresellers.com";

const fmt = (v?: string | null) =>
  v ? new Date(v).toLocaleString("en-GB", { timeZone: "Africa/Mogadishu" }) : "—";

export default function TenantDetailDialog({ tenantId, open, onOpenChange, onChanged }: Props) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tenant, setTenant] = useState<any>(null);
  const [creds, setCreds] = useState<CredRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [stats, setStats] = useState({ orders: 0, devices: 0, members: 0 });
  const [showPw, setShowPw] = useState<Record<string, boolean>>({});
  const [newPw, setNewPw] = useState<Record<string, string>>({});
  const [confirmSlug, setConfirmSlug] = useState("");
  const [cloneSel, setCloneSel] = useState<string[]>([]);
  const [cloning, setCloning] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("superadmin-tenants", { body });
    if (error || data?.error) throw new Error(data?.error || error?.message || "Khalad");
    return data;
  };

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const d = await call({ action: "detail", tenant_id: tenantId });
      setTenant(d.tenant);
      setCreds(d.credentials ?? []);
      setMembers(d.members ?? []);
      setStats(d.stats ?? { orders: 0, devices: 0, members: 0 });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && tenantId) {
      setConfirmSlug("");
      setShowPw({});
      setNewPw({});
      setCloneSel([]);
      setPickerKey((k) => k + 1);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tenantId]);

  const link = tenant ? `${PUBLIC_BASE}/?t=${tenant.slug}` : "";

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} waa la koobiyeeyay`);
    } catch {
      toast.error("Lama koobiyeyn");
    }
  };

  const run = async (body: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await call(body);
      toast.success(okMsg);
      await load();
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const suspended = tenant?.status === "suspended";

  const cloneProviders = async () => {
    if (!tenantId || cloneSel.length === 0) return;
    setCloning(true);
    try {
      const { data, error } = await supabase.rpc("clone_tenant_providers", {
        _target_tenant: tenantId,
        _provider_names: cloneSel,
      } as any);
      if (error) throw error;
      const r: any = data ?? {};
      toast.success(
        `Waa la ku daray — shirkado ${r.providers ?? 0}, qaybo ${r.categories ?? 0}, xirmooyin ${r.packages ?? 0}, flows ${r.flows ?? 0}`
      );
      setCloneSel([]);
      setPickerKey((k) => k + 1);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCloning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {tenant?.name ?? "Reseller"}
            {tenant && <Badge variant="secondary">/{tenant.slug}</Badge>}
            {tenant && (
              <Badge variant={suspended ? "destructive" : "default"}>{tenant.status}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Waa la soo dejinayaa...
          </div>
        )}

        {!loading && tenant && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border p-2">
                <p className="text-xs text-muted-foreground">Dalabyo</p>
                <p className="text-lg font-bold">{stats.orders}</p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-xs text-muted-foreground">Devices</p>
                <p className="text-lg font-bold">{stats.devices}</p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-xs text-muted-foreground">Members</p>
                <p className="text-lg font-bold">{stats.members}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-xs">
                <Link2 className="h-3.5 w-3.5" /> Link-ga reseller-ka
              </Label>
              <div className="flex gap-2">
                <Input readOnly value={link} className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => copy(link, "Link-ga")}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Input readOnly value={`${PUBLIC_BASE}/resellers`} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copy(`${PUBLIC_BASE}/resellers`, "Admin link-ga")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                <PackagePlus className="h-4 w-4" /> Shirkado ku dar
              </h4>
              <p className="text-xs text-muted-foreground">
                Flows-ka USSD, qaybaha, xirmooyinka, SIM PIN iyo wholesale tiers ayaa la koobiyeynayaa.
              </p>
              <ProviderClonePicker
                key={pickerKey}
                tenantId={tenantId}
                selected={cloneSel}
                onChange={setCloneSel}
              />
              <Button size="sm" onClick={cloneProviders} disabled={cloning || cloneSel.length === 0}>
                {cloning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Ku dar shirkadaha
              </Button>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                <Lock className="h-4 w-4" /> Xogta gelitaanka
              </h4>
              {creds.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Xog gelitaan lama diiwaangelin. Isticmaal liiska members-ka hoose.
                </p>
              )}
              {creds.map((c) => (
                <div key={c.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm">{c.email}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copy(c.email, "Email-ka")}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    {c.banned && <Badge variant="destructive">Xidhan</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm">
                      {c.initial_password ? (showPw[c.id] ? c.initial_password : "••••••••") : "— (lama kaydin)"}
                    </span>
                    {c.initial_password && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setShowPw((p) => ({ ...p, [c.id]: !p[c.id] }))}
                        >
                          {showPw[c.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => copy(c.initial_password!, "Password-ka")}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Gelitaankii ugu dambeeyay: {fmt(c.last_sign_in_at)}</p>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      placeholder="Password cusub"
                      value={newPw[c.id] ?? ""}
                      onChange={(e) => setNewPw((p) => ({ ...p, [c.id]: e.target.value }))}
                      className="h-9 max-w-[200px]"
                    />
                    <Button
                      size="sm"
                      disabled={busy || (newPw[c.id] ?? "").length < 6}
                      onClick={() =>
                        run(
                          { action: "set_password", tenant_id: tenant.id, user_id: c.user_id, email: c.email, password: newPw[c.id] },
                          "Password-ka waa la beddelay"
                        )
                      }
                    >
                      <KeyRound className="mr-1 h-3.5 w-3.5" /> Beddel
                    </Button>
                    {c.user_id && (
                      <Button
                        size="sm"
                        variant={c.banned ? "outline" : "destructive"}
                        disabled={busy}
                        onClick={() =>
                          run(
                            { action: "set_access", tenant_id: tenant.id, user_id: c.user_id, banned: !c.banned },
                            c.banned ? "Waa la furay" : "Waa la xidhay"
                          )
                        }
                      >
                        {c.banned ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <Ban className="mr-1 h-3.5 w-3.5" />}
                        {c.banned ? "Fur" : "Xidh"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Members</h4>
              {members.map((m) => (
                <div key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{m.email ?? m.user_id}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.role} · {fmt(m.last_sign_in_at)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={m.banned ? "outline" : "destructive"}
                    disabled={busy}
                    onClick={() =>
                      run(
                        { action: "set_access", tenant_id: tenant.id, user_id: m.user_id, banned: !m.banned },
                        m.banned ? "Waa la furay" : "Waa la xidhay"
                      )
                    }
                  >
                    {m.banned ? "Fur" : "Xidh"}
                  </Button>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-3 rounded-lg border border-destructive/40 p-3">
              <h4 className="text-sm font-semibold text-destructive">Talaabooyin culus</h4>
              <Button
                variant={suspended ? "outline" : "destructive"}
                disabled={busy}
                onClick={() =>
                  run(
                    { action: "set_access", tenant_id: tenant.id, banned: !suspended },
                    suspended ? "Reseller-ka waa la firfircooneeyay" : "Reseller-ka waa la joojiyay"
                  )
                }
              >
                {suspended ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Ban className="mr-2 h-4 w-4" />}
                {suspended ? "Dib u fur reseller-ka" : "Jooji reseller-ka (dhammaan users-ka)"}
              </Button>

              <div className="space-y-2">
                <Label className="text-xs">
                  Tirtir gebi ahaan — qor slug-ga <span className="font-mono">{tenant.slug}</span> si aad u xaqiijiso
                </Label>
                <div className="flex gap-2">
                  <Input value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value)} placeholder={tenant.slug} />
                  <Button
                    variant="destructive"
                    disabled={busy || confirmSlug !== tenant.slug}
                    onClick={async () => {
                      await run(
                        { action: "delete", tenant_id: tenant.id, confirm_slug: confirmSlug },
                        "Reseller-ka waa la tirtiray"
                      );
                      onOpenChange(false);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Tirtir
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
