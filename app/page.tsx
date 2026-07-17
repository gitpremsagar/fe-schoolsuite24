import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const features = [
  {
    title: "School setup",
    description: "Create academic years, classes, teachers, employees, and students.",
  },
  {
    title: "Attendance",
    description:
      "Mark students present or absent, and track staff punch-in / punch-out times.",
  },
  {
    title: "Per-student billing",
    description:
      "Start with a free 30-day trial. After that, pay based on enrolled students.",
  },
];

const faqs = [
  {
    q: "Who can register?",
    a: "School owners register as admins. They then create accounts for teachers, employees, and students.",
  },
  {
    q: "Is the first month free?",
    a: "Yes. Every new school gets a 30-day trial with full access.",
  },
  {
    q: "How is pricing calculated?",
    a: "Each school has its own per-student rate set by the platform. Monthly dues = enrolled students × rate.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="font-semibold">School ERP</div>
          <div className="flex gap-2">
            <Link href="/login">
              <Button variant="ghost">Log in</Button>
            </Link>
            <Link href="/register">
              <Button>Start free trial</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-medium text-muted-foreground">
              Built for school owners
            </p>
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
              Run your school from one simple ERP platform
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Manage classes, students, staff, attendance, and subscriptions —
              with a free first month for every school.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register">
                <Button size="lg">Register your school</Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline">
                  Log in
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="border-y bg-muted/30">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-12 md:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <CardTitle>{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold">Simple pricing</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Use the platform free for 30 days. Afterwards, your school is charged
            a fixed amount for each enrolled student. Different schools can have
            different per-student rates.
          </p>
          <Card className="mt-6 max-w-xl">
            <CardHeader>
              <CardTitle>Trial then per-student billing</CardTitle>
              <CardDescription>
                Platform admin sets your school&apos;s rate and unlocks access after payment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                <li>30-day free trial on registration</li>
                <li>Admin creates teachers and students</li>
                <li>Attendance for students and staff included</li>
              </ul>
            </CardContent>
          </Card>
        </section>

        <section className="border-t bg-muted/20">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-semibold">FAQ</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {faqs.map((item) => (
                <Card key={item.q}>
                  <CardHeader>
                    <CardTitle className="text-base">{item.q}</CardTitle>
                    <CardDescription>{item.a}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
