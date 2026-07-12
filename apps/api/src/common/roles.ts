export const ROLES = [
  'platform_owner',
  'tenant_admin',
  'sales',
  'dealer',
  'production',
  'viewer',
] as const;
export type Role = (typeof ROLES)[number];

/** Role z dostępem do wewnętrznego BOM i danych produkcyjnych. */
export const BOM_ROLES: Role[] = ['platform_owner', 'tenant_admin', 'production'];

/** Role z prawem zapisu w panelu (katalog, assety, reguły, ceny). */
export const ADMIN_WRITE_ROLES: Role[] = ['platform_owner', 'tenant_admin'];

/** Role z dostępem odczytu do panelu. */
export const ADMIN_READ_ROLES: Role[] = [
  'platform_owner',
  'tenant_admin',
  'sales',
  'dealer',
  'production',
  'viewer',
];

export const SALES_ROLES: Role[] = ['platform_owner', 'tenant_admin', 'sales', 'dealer'];
