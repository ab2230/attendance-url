import { Suspense } from "react";
import EmergencyPermissionClient from "../components/EmergencyPermissionClient";

type PageProps = {
  searchParams: Promise<{ program?: string }>;
};

async function PermissionPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const programId = params.program?.trim() ?? "";

  return <EmergencyPermissionClient programId={programId} />;
}

export default function PermissionRoute(props: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center py-24 text-zinc-600">
          Loading…
        </div>
      }
    >
      <PermissionPage searchParams={props.searchParams} />
    </Suspense>
  );
}