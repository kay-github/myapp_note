import { prisma } from "@/lib/prisma";

type AuditInput = {
  action: string;
  actor: "visitor" | "space" | "admin";
  ip: string;
  spaceId?: string;
  detail?: string;
};

export async function writeAudit(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: input.action,
      actor: input.actor,
      ip: input.ip,
      spaceId: input.spaceId,
      detail: input.detail,
    },
  });
}
