import { canWriteWithSpaceCookie, isAdminAuthed } from "@/lib/auth";
import { Space } from "@prisma/client";

export async function canWriteSpace(space: Space): Promise<boolean> {
  if (await isAdminAuthed()) {
    return true;
  }

  if (!space.passwordHash) {
    return false;
  }

  return canWriteWithSpaceCookie(space.slug);
}
