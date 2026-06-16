import type { Prisma } from "@prisma/client";
import type { OrganizationSettings, StoredMapping } from "../shared/api-types";
import { prisma } from "./prisma";

function parseSettings(raw: unknown): OrganizationSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return raw as OrganizationSettings;
}

export async function getMapping(
  organizationId: string,
  fingerprint: string
): Promise<StoredMapping | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  if (!org) return null;

  const settings = parseSettings(org.settings);
  return settings.columnMappings?.[fingerprint] ?? null;
}

export async function saveMapping(
  organizationId: string,
  fingerprint: string,
  mapping: StoredMapping
): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  if (!org) {
    throw new Error(`Organizacja nie istnieje: ${organizationId}`);
  }

  const settings = parseSettings(org.settings);
  const columnMappings = {
    ...(settings.columnMappings ?? {}),
    [fingerprint]: mapping,
  };

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      settings: {
        ...settings,
        columnMappings,
      } as unknown as Prisma.InputJsonValue,
    },
  });
}
