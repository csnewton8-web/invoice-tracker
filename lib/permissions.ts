export type CompanyRole =
  | "owner"
  | "admin"
  | "member"
  | "viewer";

export function canUploadInvoices(role: CompanyRole) {
  return ["owner", "admin", "member"].includes(role);
}

export function canEditInvoices(role: CompanyRole) {
  return ["owner", "admin", "member"].includes(role);
}

export function canDeleteInvoices(role: CompanyRole) {
  return ["owner", "admin"].includes(role);
}

export function canManageSuppliers(role: CompanyRole) {
  return ["owner", "admin", "member"].includes(role);
}

export function canManageReminders(role: CompanyRole) {
  return ["owner", "admin"].includes(role);
}

export function canManageTeam(role: CompanyRole) {
  return ["owner", "admin"].includes(role);
}

export function canManageBilling(role: CompanyRole) {
  return role === "owner";
}

export function canManageCompanySettings(role: CompanyRole) {
  return ["owner", "admin"].includes(role);
}

export function canViewInvoices(role: CompanyRole) {
  return ["owner", "admin", "member", "viewer"].includes(role);
}