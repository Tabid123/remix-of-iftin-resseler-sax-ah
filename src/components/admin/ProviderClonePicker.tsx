import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface Props {
  tenantId?: string | null;
  selected: string[];
  onChange: (v: string[]) => void;
}

export default function ProviderClonePicker({ tenantId, selected, onChange }: Props) {
  const [providers, setProviders] = useState<string[]>([]);
  const [existing, setExisting] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("superadmin-tenants", {
        body: { action: "source_providers", tenant_id: tenantId ?? null },
      });
      if (!active) return;
      setLoading(false);
      if (error || data?.error) return;
      setProviders(data.providers ?? []);
      setExisting((data.existing ?? []).map((n: string) => n.toLowerCase()));
    })();
    return () => {
      active = false;
    };
  }, [tenantId]);

  const toggle = (name: string) => {
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);
  };

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Shirkadaha waa la soo dejinayaa...
      </p>
    );
  }

  if (providers.length === 0) {
    return <p className="text-xs text-muted-foreground">Wax shirkad ah lama helin.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {providers.map((name) => {
        const owned = existing.includes(name.toLowerCase());
        return (
          <label
            key={name}
            className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${
              owned ? "opacity-60" : "cursor-pointer"
            }`}
          >
            <Checkbox
              checked={owned || selected.includes(name)}
              disabled={owned}
              onCheckedChange={() => !owned && toggle(name)}
            />
            <span className="flex-1">{name}</span>
            {owned && <Badge variant="secondary" className="text-[10px]">Wuu jiraa</Badge>}
          </label>
        );
      })}
    </div>
  );
}
