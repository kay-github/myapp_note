import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { MAX_FILE_SIZE } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { canWriteSpace } from "@/lib/space-permission";
import { getClientIp } from "@/lib/request";
import { checkRateLimit } from "@/lib/ratelimit";

const payloadSchema = z.object({
  slug: z.string().min(1),
  originalName: z.string().min(1).max(255),
  mimeType: z.string().max(100),
  size: z.number().int().positive(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const ip = await getClientIp();
  if (!checkRateLimit(`blob-upload:${ip}`, 60, 5 * 60 * 1000)) {
    return new NextResponse("Too many requests", { status: 429 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const parsed = payloadSchema.safeParse(JSON.parse(clientPayload || "{}"));
        if (!parsed.success) {
          throw new Error("Invalid upload payload");
        }

        if (parsed.data.size > MAX_FILE_SIZE) {
          throw new Error("File too large, max 50MB");
        }

        const space = await prisma.space.findUnique({ where: { slug: parsed.data.slug } });
        if (!space || !(await canWriteSpace(space))) {
          throw new Error("Write permission required");
        }

        return {
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_FILE_SIZE,
          tokenPayload: JSON.stringify(parsed.data),
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload token generation failed";
    console.error("[blob-upload]", message);
    return new NextResponse(message, { status: 400 });
  }
}
