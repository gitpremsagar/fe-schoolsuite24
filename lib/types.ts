export type UserRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "TEACHER"
  | "EMPLOYEE"
  | "STUDENT";

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
  schoolId: string | null;
  isActive: boolean;
};

export type AuthResponse = {
  accessToken: string;
  user: PublicUser;
  school?: { id: string; name: string };
};

export type ApiError = {
  error: string;
  code?: string;
};

export function dashboardPathForRole(role: UserRole): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/dashboard/super-admin";
    case "ADMIN":
      return "/dashboard/school";
    case "TEACHER":
      return "/dashboard/teacher";
    case "EMPLOYEE":
      return "/dashboard/employee";
    case "STUDENT":
      return "/dashboard/student";
    default:
      return "/dashboard";
  }
}

export function formatMoney(amount: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}
