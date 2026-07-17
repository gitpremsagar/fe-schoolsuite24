"use client";

import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AccessBlockedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>School access disabled</CardTitle>
          <CardDescription>
            Your school trial or subscription is inactive. Please contact the
            platform administrator to renew access after payment.
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <Link href="/dashboard/school/billing">
            <Button className="mr-2">View billing</Button>
          </Link>
          <Link href="/login">
            <Button variant="outline">Back to login</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
