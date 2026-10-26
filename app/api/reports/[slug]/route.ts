import { loadOrg } from "@/server/context";
import { reports } from "@/server/data";

export const dynamic = "force-dynamic";

function csv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => `"${String(row[header] ?? "").replaceAll('"', '""')}"`).join(","));
  }
  return lines.join("\n");
}

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const loaded = await loadOrg(slug);
  if (!loaded || loaded === "login" || loaded === "mfa") return new Response("Not found", { status: 404 });
  if (!loaded.can("report.export") && !loaded.can("inventory.export")) {
    return new Response("Forbidden", { status: 403 });
  }
  const data = await reports(loaded);
  const sections = loaded.can("report.export")
    ? [
        ["cases", data.cases],
        ["services", data.services],
        ["inventory", data.inventory],
        ["volunteer_hours", data.hours],
      ]
    : [["inventory", data.inventory]];
  const body = sections.map(([name, rows]) => `# ${name}\n${csv(rows as Record<string, unknown>[])}`).join("\n\n");
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-report.csv"`,
    },
  });
}
