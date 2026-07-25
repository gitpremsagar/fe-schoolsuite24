"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingPulseCard } from "@/components/ui/loading-pulse-card";
import { attendanceApi, schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";

const printStyles = `
@media print {
  body * {
    visibility: hidden;
  }
  #staff-punch-poster,
  #staff-punch-poster * {
    visibility: visible;
  }
  #staff-punch-poster {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    border: none;
    padding: 0;
  }
}
`;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function formatRotatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StaffPunchQrPage() {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [rotatedAt, setRotatedAt] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleErr = useCallback(
    (err: unknown, fallback: string) => {
      if (isSubscriptionInactive(err)) {
        router.replace("/access-blocked");
        return "";
      }
      return errorMessage(err, fallback);
    },
    [router],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [qrRes, schoolRes] = await Promise.all([
        attendanceApi.staffQr(),
        schoolApi.me(),
      ]);
      setLink(qrRes.qr.link);
      setRotatedAt(qrRes.qr.rotatedAt);
      setSchoolName(str(schoolRes.school.name));
    } catch (err) {
      setError(handleErr(err, "Failed to load the punch QR code"));
    } finally {
      setLoading(false);
    }
  }, [handleErr]);

  useEffect(() => {
    void load();
  }, [load]);

  async function rotate() {
    setRotating(true);
    setError("");
    setMessage("");
    try {
      const res = await attendanceApi.rotateStaffQr();
      setLink(res.qr.link);
      setRotatedAt(res.qr.rotatedAt);
      setConfirmOpen(false);
      setMessage("New QR code generated. Print and replace the old poster.");
    } catch (err) {
      setError(handleErr(err, "Failed to regenerate the punch QR code"));
    } finally {
      setRotating(false);
    }
  }

  return (
    <div className="space-y-4">
      <style>{printStyles}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/school/attendance/staff">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to staff attendance
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmOpen(true)}
            disabled={loading || rotating || !link}
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            Regenerate
          </Button>
          <Button
            type="button"
            onClick={() => window.print()}
            disabled={loading || !link}
          >
            <Printer className="mr-1 h-4 w-4" />
            Print poster
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground print:hidden">
        Print this QR code and put it up where staff enter the school. Every
        staff member scans the same code from the SchoolSuite Teacher app: the
        first scan of the day punches them in and the next one punches them out,
        using the time of the scan.
      </p>

      {error ? (
        <p className="text-sm text-destructive print:hidden">{error}</p>
      ) : null}
      {message ? (
        <p className="text-sm text-green-600 print:hidden">{message}</p>
      ) : null}

      {loading ? (
        <LoadingPulseCard />
      ) : link ? (
        <>
          <div
            id="staff-punch-poster"
            className="mx-auto max-w-xl rounded-xl border bg-white p-10 text-center text-black"
          >
            <p className="text-3xl font-semibold">{schoolName || "School"}</p>
            <p className="mt-1 text-lg">Staff attendance</p>
            <div className="mt-8 flex justify-center">
              <QRCodeSVG value={link} size={320} level="M" marginSize={4} />
            </div>
            <p className="mt-8 text-xl font-semibold">
              Scan to punch in / punch out
            </p>
            <ol className="mx-auto mt-4 max-w-sm space-y-1 text-left text-base">
              <li>1. Open the SchoolSuite Teacher app and sign in.</li>
              <li>2. Go to More, then Scan to punch.</li>
              <li>3. Point your camera at this code.</li>
            </ol>
            <p className="mt-6 text-sm">
              Your first scan of the day records punch in, the next scan records
              punch out.
            </p>
          </div>

          <div className="text-center text-xs text-muted-foreground print:hidden">
            {rotatedAt
              ? `This code was generated on ${formatRotatedAt(rotatedAt)}.`
              : null}
          </div>
        </>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Regenerate the punch QR code?</DialogTitle>
            <DialogDescription>
              Every poster already printed will stop working. Staff can only
              punch in or out after you print and put up the new code.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={rotating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void rotate()}
              disabled={rotating}
            >
              {rotating ? "Generating..." : "Regenerate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
