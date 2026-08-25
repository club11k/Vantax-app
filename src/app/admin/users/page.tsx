import { prisma } from "@/lib/prisma";
import { UserRow } from "@/components/admin/UserRow";

export default async function AdminUsersPage() {
  const [users, plans] = await Promise.all([
    prisma.user.findMany({ include: { plan: true }, orderBy: { createdAt: "desc" } }),
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Usuarios registrados ({users.length})</h2>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Estado</th>
              <th>Plan</th>
              <th>Uso este mes</th>
              <th>Rol</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={{
                  id: u.id,
                  email: u.email,
                  name: u.name,
                  role: u.role,
                  subscriptionStatus: u.subscriptionStatus,
                  suspended: u.suspended,
                  analysesUsedInPeriod: u.analysesUsedInPeriod,
                  planId: u.planId,
                  planName: u.plan?.name ?? null,
                  planQuota: u.plan?.monthlyQuota ?? null,
                }}
                plans={plans.map((p) => ({ id: p.id, name: p.name }))}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
