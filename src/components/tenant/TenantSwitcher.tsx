import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTenant } from '@/contexts/TenantContext';

export function TenantSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { tenant, tenants, switchTenant, logoUrl } = useTenant();

  if (!tenant) return null;

  const badge = logoUrl
    ? <img src={logoUrl} alt={`${tenant.name} logo`} className="h-5 w-5 rounded object-cover" />
    : <Building2 className="h-4 w-4 shrink-0" />;

  if (tenants.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-2 py-2 text-sm font-medium truncate">
        {badge}
        {!collapsed && <span className="truncate">{tenant.name}</span>}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between px-2">
          <span className="flex items-center gap-2 truncate">
            {badge}
            {!collapsed && <span className="truncate">{tenant.name}</span>}
          </span>
          {!collapsed && <ChevronsUpDown className="h-4 w-4 opacity-50" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 bg-popover z-50">
        {tenants.map((t) => (
          <DropdownMenuItem key={t.id} onClick={() => switchTenant(t.id)} className="gap-2">
            <Building2 className="h-4 w-4" />
            <span className="truncate flex-1">{t.name}</span>
            {t.id === tenant.id && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}