import { z } from 'zod';
import { fail, ok } from '@/lib/http';
import { hashServerSeed, verifyBoard } from '@/lib/provablyFair';

const bodySchema = z.object({
  serverSeed: z.string().min(1),
  hashedServerSeed: z.string().min(1),
  clientSeed: z.string().min(1),
  nonce: z.number().int().nonnegative(),
  gridSize: z.number().int().min(3).max(7),
  mineCount: z.number().int().min(1).max(24),
  expectedMines: z.array(z.number().int().nonnegative())
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());

    const hashed = hashServerSeed(body.serverSeed);
    const seedMatches = hashed === body.hashedServerSeed;

    const boardMatches = verifyBoard({
      gridSize: body.gridSize,
      mineCount: body.mineCount,
      serverSeed: body.serverSeed,
      clientSeed: body.clientSeed,
      nonce: body.nonce,
      expectedMines: body.expectedMines
    });

    return ok({
      seedMatches,
      boardMatches,
      verified: seedMatches && boardMatches
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.errors[0]?.message || 'Invalid verification payload', 400);
    }

    return fail('Unable to verify game', 500);
  }
}
