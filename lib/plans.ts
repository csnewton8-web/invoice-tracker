export const FREE_PLAN_MAX_INVOICES = 10;

export function isPaidPlan(plan?: string | null, status?: string | null) {
  return (
    plan === "starter" &&
    ["active", "trialing", "past_due"].includes(status || "active")
  );
}

export function canUseReminders(plan?: string | null, status?: string | null) {
  return isPaidPlan(plan, status);
}

export function canUseReminderFeatures(
  plan?: string | null,
  status?: string | null
) {
  return canUseReminders(plan, status);
}

export function getInvoiceLimitForPlan(plan?: string | null) {
  if (plan === "starter") return null;
  return FREE_PLAN_MAX_INVOICES;
}

export function canUploadMoreInvoices(
  plan: string | null | undefined,
  status: string | null | undefined,
  currentInvoiceCount: number
) {
  if (isPaidPlan(plan, status)) return true;

  const limit = getInvoiceLimitForPlan(plan);
  if (limit === null) return true;

  return currentInvoiceCount < limit;
}