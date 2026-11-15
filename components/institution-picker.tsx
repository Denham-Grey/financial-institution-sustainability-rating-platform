"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function InstitutionPicker({
  institutions,
  selected,
}: {
  institutions: { id: number; name: string }[];
  selected?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = Number(searchParams.get("institution")) || selected || institutions[0]?.id;
  return (
    <div className="topbar-context" hidden={pathname === "/certificates"}>
      <span className="context-label">Institution</span>
      <select
        id="global-institution-select"
        aria-label="Selected institution"
        value={current}
        disabled={institutions.length === 0}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("institution", event.target.value);
          router.push(`?${params.toString()}`);
        }}
      >
        {institutions.length ? (
          institutions.map((institution) => (
            <option key={institution.id} value={institution.id}>
              {institution.name}
            </option>
          ))
        ) : (
          <option value="">No institutions available</option>
        )}
      </select>
    </div>
  );
}
