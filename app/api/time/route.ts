import { connection } from 'next/server';

export async function GET() {
  await connection();
  const now = Date.now();
  return Response.json(
    { now, iso: new Date(now).toISOString() },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
}
