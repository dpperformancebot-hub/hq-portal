import { redirect } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { moneyHiddenFromViewer } from "@/lib/access-policy";
import { getServerIdentity } from "@/lib/role-server";
import { TjdPayrollView } from "@/components/screens/pay/tjd-payroll-view";

/** TJD only, owner/admin only. DP pays from check-in codes and has no ticking.
 *  Not while the owner views as a coach: that view is exactly the coach's,
 *  and a coach is sent to the dashboard. */
export default async function PayrollPage() {
  if (BRAND.pay.model !== "weeks-paid") redirect("/dashboard");
  const identity = await getServerIdentity();
  if (!(identity.realRole === "owner" || identity.role === "admin") || moneyHiddenFromViewer(identity)) {
    redirect("/dashboard");
  }
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return <TjdPayrollView initialMonth={month} />;
}
