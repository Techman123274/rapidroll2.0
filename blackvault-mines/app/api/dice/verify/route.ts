import { z } from 'zod';
import { fail, ok } from '@/lib/http';
import { generateDiceRoll, hashSeed } from '@/lib/diceFair';

const bodySchema = z.object({
  serverSeed: z.string().min(1),
  hashedServerSeed: z.string().min(1),
  clientSeed: z.string().min(1),
  nonce: z.number().int().nonnegative(),
  expectedRoll: z.number().min(0).max(99.99)
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());

    const computedHash = hashSeed(body.serverSeed);
    const computedRoll = generateDiceRoll({
      serverSeed: body.serverSeed,
      clientSeed: body.clientSeed,
      nonce: body.nonce
    });

    const seedMatches = computedHash === body.hashedServerSeed;
    const rollMatches = Number(computedRoll.toFixed(2)) === Number(body.expectedRoll.toFixed(2));

    return ok({
      seedMatches,
      rollMatches,
      computedRoll,
      verified: seedMatches && rollMatches
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.errors[0]?.message || 'Invalid verification payload', 400);
    }
    return fail('Unable to verify dice roll', 500);
  }
}
