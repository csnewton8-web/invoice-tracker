export async function createAuditLog({
  supabase,
  companyId,
  userId,
  action,
  entityType,
  entityId,
  metadata = {},
}: {
  supabase: any;
  companyId: string;
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabase.from("audit_logs").insert({
    company_id: companyId,
    user_id: userId ?? null,
    action,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    metadata,
  });

  if (error) {
    console.error("Failed to create audit log:", error);
  }
}