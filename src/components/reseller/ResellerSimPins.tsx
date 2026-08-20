import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Loader2, Save, RefreshCw } from "lucide-react";

interface Row {
  provider_id: string;
  provider_name: string;
  pin: string;
  saved: string;
  hasRow: boolean;
}

export default function ResellerSimPins() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? null;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [show, setShow] = useState<Record<string, boolean>>({});

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data: provs, error: pErr } = await supabase
        .from("providers_config")
        .select("id, provider_name, display_order")
        .eq("tenant_id", tenantId)
        .order("display_order", { ascending: true });
      if (pErr) throw pErr;

      const ids = (provs ?? []).map((p) => p.id);
      let instr: any[] = [];
      if (ids.length) {
        const { data, error } = await supabase
          .from("delivery_instructions")
          .select("provider_id, sim_password")
          .in("provider_id", ids);
        if (error) throw error;
        instr = data ?? [];
      }

      setRows(
        (provs ?? []).map((p) => {
          const match = instr.find((i) => i.provider_id === p.id && i.sim_password);
          const pin = match?.sim_password ?? "";
          return {
            provider_id: p.id,
            provider_name: p.provider_name,
            pin,
            saved: pin,
            hasRow: instr.some((i) => i.provider_id === p.id),
          };
        })
      );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const setPin = (id: string, v: string) =>
    setRows((prev) =>
      prev.map((r) => (r.provider_id === id ? { ...r, pin: v.replace(/\D/g, "").slice(0, 8) } : r))
    );

  const save = async (row: Row) => {
    if (!tenantId) return;
    if (row.pin.length < 4) {
      toast.error("PIN-ku waa inuu ka kooban yahay ugu yaraan 4 lambar");
      return;
    }
    setSavingId(row.provider_id);
    try {
      if (row.hasRow) {
        const { error } = await supabase
          .from("delivery_instructions")
          .update({ sim_password: row.pin })
          .eq("provider_id", row.provider_id)
          .eq("tenant_id", tenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("delivery_instructions").insert({
          tenant_id: tenantId,
          provider_id: row.provider_id,
          instruction_template: "",
          sim_password: row.pin,
          ussd_method: "interactive",
        });
        if (error) throw error;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.provider_id === row.provider_id ? { ...r, saved: row.pin, hasRow: true } : r
        )
      );
      toast.success(`PIN-ka ${row.provider_name} waa la kaydiyay`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" /> SIM PIN shirkad kasta
        </CardTitle>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Cusboonaysii
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          PIN-kan waxaa loo isticmaalaa USSD-ka automatic-ka ah ee shirkad kasta. Kaliya adiga ayaa arki kara.
        </p>

        {loading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Waa la soo dejinayaa...
          </div>
        )}

        {!loading && rows.length === 0 && (
          <p className="py-6 text-sm text-muted-foreground">Wax shirkad ah lagama helin workspace-kaaga.</p>
        )}

        {!loading &&
          rows.map((r) => {
            const dirty = r.pin !== r.saved;
            return (
              <div
                key={r.provider_id}
                className="flex flex-wrap items-center gap-2 rounded-lg border p-3"
              >
                <div className="min-w-[110px] flex-1">
                  <p className="text-sm font-semibold">{r.provider_name}</p>
                  {!r.saved && <Badge variant="secondary" className="mt-1 text-[10px]">PIN ma jiro</Badge>}
                </div>
                <Input
                  value={r.pin}
                  type={show[r.provider_id] ? "text" : "password"}
                  inputMode="numeric"
                  placeholder="PIN"
                  onChange={(e) => setPin(r.provider_id, e.target.value)}
                  className="w-28 font-mono"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShow((s) => ({ ...s, [r.provider_id]: !s[r.provider_id] }))}
                >
                  {show[r.provider_id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  onClick={() => save(r)}
                  disabled={!dirty || savingId === r.provider_id}
                >
                  {savingId === r.provider_id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Kaydi
                </Button>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
