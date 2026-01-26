"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TriangleAlert } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-6">
      <Card className="w-full max-w-lg bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <TriangleAlert className="h-5 w-5 text-amber-400" />
            Page Not Found
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-white/70">
          <p>
            The page you are looking for does not exist or has been moved. Check the URL
            or return to a safe location.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
            {/* <Button asChild  className="border-white/20 text-white hover:bg-white/10">
              <Link href="/admin">Admin Home</Link>
            </Button> */}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
