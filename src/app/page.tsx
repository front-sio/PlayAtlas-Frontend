'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Users, Wallet, Gamepad2 } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
    }
  }, [status, router]);

  if (status === 'loading') return null;

  return (
    <div className="space-y-10">
      <section className="text-center space-y-4">
        <h1 className="text-4xl md:text-5xl font-bold text-white">
          PlayAtlas
        </h1>
        <p className="text-lg md:text-xl text-purple-200">
          Compete in 8-ball pool tournaments, climb the ranks, and win real prizes.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
          <Link href="/auth/login">
            <Button  className="border-white/20 text-white hover:bg-white/10">
              Sign in
            </Button>
          </Link>
          <Link href="/auth/register">
            <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700">
              Create account
            </Button>
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-400" />
              Tournaments
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-white/70">
            Continuous tournaments that generate seasons automatically while active.
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="h-5 w-5 text-cyan-400" />
              Seasons
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-white/70">
            Players join seasons (not tournaments). Joining implies the season fee is paid.
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Wallet className="h-5 w-5 text-green-400" />
              Wallet
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-white/70">
            Deposits and payouts are manual approval flows designed for compliance and auditability.
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Gamepad2 className="h-5 w-5 text-purple-300" />
              Game
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-white/70">
            Play matches only after season join + fee payment is verified.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

