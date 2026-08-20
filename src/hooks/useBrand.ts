import { useTenant } from '@/contexts/TenantContext';

export const DEFAULT_BRAND = '#0066CC';
export const DEFAULT_BRAND_DARK = '#004fa3';

/** Darken a hex color by a ratio (0-1) */
export const shadeHex = (hex: string, ratio = 0.25) => {
  const m = /^#?([a-f\d]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => Math.max(0, Math.round(v * (1 - ratio))))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
  return `#${c}`;
};

/** Tenant branding (logo, name, primary color) with app defaults */
export const useBrand = () => {
  const { tenant, logoUrl } = useTenant();
  const primary = tenant?.primary_color || DEFAULT_BRAND;
  return {
    tenant,
    logoUrl,
    name: tenant?.name || 'Iftin Internet',
    primary,
    primaryDark: tenant?.primary_color ? shadeHex(primary, 0.3) : DEFAULT_BRAND_DARK,
    primaryDeep: tenant?.primary_color ? shadeHex(primary, 0.55) : '#0e1b3d',
  };
};
