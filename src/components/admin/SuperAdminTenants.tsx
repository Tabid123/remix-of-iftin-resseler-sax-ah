import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, RefreshCw, Users, ShoppingCart, DollarSign, Settings2 } from "lucide-react";
import TenantDetailDialog from "./TenantDetailDialog";

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  logo_url: string | null;
  primary_color: string | null;
  owner_email: string | null;
  member_count: number;
  order_count: number;
  revenue: number;
  created_at: string;
}

const PLANS = ["free", "pro", "enterprise"];
const STATUSES = ["active", "suspended", "trial"];

export default function SuperAdminTenants() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("superadmin-tenants", {
      body: { action: "list" },
    });
    setLoading(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Lama soo dejin tenants-ka");
      return;
    }
    setTenants(data.tenants ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const update = async (tenantId: string, patch: { plan?: string; status?: string }) => {
    const { data, error } = await supabase.functions.invoke("superadmin-tenants", {
      body: { action: "update", tenant_id: tenantId, ...patch },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Lama cusboonaysiin");
      return;
    }
    setTenants((prev) => prev.map((t) => (t.id === tenantId ? { ...t, ...patch } : t)));
    toast.success("Waa la cusboonaysiiyay");
  };

  const filtered = tenants.filter(
    (t) =>
      t.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.slug?.toLowerCase().includes(search.toLowerCase()) ||
      (t.owner_email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totals = tenants.reduce(
    (acc, t) => ({
      members: acc.members + t.member_count,
      orders: acc.orders + t.order_count,
      revenue: acc.revenue + t.revenue,
    }),
    { members: 0, orders: 0, revenue: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Building2 className="h-5 w-5" /> Tenants (Super Admin)
        </h2>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Cusboonaysii
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Tenants</p><p className="text-2xl font-bold">{tenants.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3 w-3" /> Members</p><p className="text-2xl font-bold">{totals.members}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="flex items-center gap-1 text-xs text-muted-foreground"><ShoppingCart className="h-3 w-3" /> Orders</p><p className="text-2xl font-bold">{totals.orders}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="flex items-center gap-1 text-xs text-muted-foreground"><DollarSign className="h-3 w-3" /> Revenue</p><p className="text-2xl font-bold">${totals.revenue.toFixed(2)}</p></CardContent></Card>
      </div>

      <Input
        placeholder="Raadi magac, slug ama email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <div className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Waa la soo dejinayaa...</p>}
        {!loading && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">Wax tenant ah lama helin.</p>
        )}
        {filtered.map((t) => (
          <Card key={t.id}>
            <CardHeader
              className="cursor-pointer pb-2"
              onClick={() => setDetailId(t.id)}
            >
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <span
                  className="inline-block h-3 w-3 rounded-full border"
                  style={{ backgroundColor: t.primary_color || "transparent" }}
                />
                {t.name}
                <Badge variant="secondary">/{t.slug}</Badge>
                <Badge variant={t.status === "active" ? "default" : "destructive"}>{t.status}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                <div><span className="text-muted-foreground">Owner: </span>{t.owner_email ?? "—"}</div>
                <div><span className="text-muted-foreground">Members: </span>{t.member_count}</div>
                <div><span className="text-muted-foreground">Orders: </span>{t.order_count}</div>
                <div><span className="text-muted-foreground">Revenue: </span>${t.revenue.toFixed(2)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={t.plan} onValueChange={(v) => update(t.id, { plan: v })}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={t.status} onValueChange={(v) => update(t.id, { status: v })}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="secondary" onClick={() => setDetailId(t.id)}>
                  <Settings2 className="mr-2 h-4 w-4" /> Maamul / Xogta
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <TenantDetailDialog
        tenantId={detailId}
        open={!!detailId}
        onOpenChange={(v) => !v && setDetailId(null)}
        onChanged={load}
      />
    </div>
  );
}
