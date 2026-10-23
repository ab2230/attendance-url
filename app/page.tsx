import { Suspense } from "react";
import AttendanceRoomClient from "./components/AttendanceRoomClient";

type PageProps = {
  searchParams: Promise<{ program?: string; room?: string }>;
};

async function RoomPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const programId = params.program?.trim() ?? "";
  const roomId = params.room?.trim() ?? "";

  return <AttendanceRoomClient programId={programId} roomId={roomId} />;
}

export default function Home(props: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center py-24 text-zinc-600">
          Loading…
        </div>
      }
    >
      <RoomPage searchParams={props.searchParams} />
    </Suspense>
  );
}
