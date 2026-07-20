import { Card, CardContent } from "@/components/ui/card";

export function LoadingPulseCard() {
  return (
    <Card className="animate-pulse">
      <CardContent className="space-y-3 p-6">
        <div className="h-4 w-1/3 rounded-md bg-muted" />
        <div className="h-4 w-full rounded-md bg-muted" />
        <div className="h-4 w-5/6 rounded-md bg-muted" />
        <div className="h-4 w-2/3 rounded-md bg-muted" />
        <div className="h-4 w-4/5 rounded-md bg-muted" />
      </CardContent>
    </Card>
  );
}
