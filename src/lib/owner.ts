// Who may use the portal. PORTAL_OWNER_EMAIL is server-only and may hold one
// address or a comma-separated list. Fails closed: with no owner configured,
// nobody is treated as the owner.
export function ownerEmails(raw = process.env.PORTAL_OWNER_EMAIL): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwnerEmail(
  email: string | null | undefined,
  raw = process.env.PORTAL_OWNER_EMAIL,
): boolean {
  const owners = ownerEmails(raw);
  const candidate = email?.trim().toLowerCase();
  return !!candidate && owners.includes(candidate);
}
