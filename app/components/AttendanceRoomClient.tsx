"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  getOrCreateClientKey,
  getRoomCompletion,
  saveRoomCompletion,
} from "@/lib/roomStorage";
import MemberSearchPicker from "./MemberSearchPicker";

type RoomMember = {
  member_id: string;
  first_name: string;
  last_name: string;
  status: string;
  already_present: boolean;
};

type VerifySuccess = {
  ok: true;
  room_id: string;
  program_name: string;
  expires_at: string;
};

type VerifyFailure = {
  ok: false;
  error: string;
  attempts_left?: number;
};

type VerifyResult = VerifySuccess | VerifyFailure;

function errorMessage(code: string, attemptsLeft?: number): string {
  switch (code) {
    case "invalid_otp":
      return attemptsLeft != null
        ? `Wrong code. ${attemptsLeft} attempt(s) left.`
        : "Wrong code.";
    case "locked":
      return "Too many wrong attempts. Wait for the next session or ask your teacher.";
    case "expired":
      return "This attendance session has expired.";
    case "no_active_session":
      return "No attendance is open right now. Ask your teacher for today's code.";
    case "room_not_found":
    case "program_not_found":
      return "Invalid attendance link.";
    case "not_verified":
      return "Enter today's code first.";
    case "already_marked":
      return "You are already marked present for this session.";
    case "not_enrolled":
      return "You are not enrolled in this program.";
    default:
      return "Something went wrong. Please try again.";
  }
}

type Props = {
  programId: string;
  roomId: string;
};

export default function AttendanceRoomClient({ programId, roomId }: Props) {
  const useProgramLink = Boolean(programId);
  const linkId = programId || roomId;

  const [clientKey, setClientKey] = useState("");
  const [sessionRoomId, setSessionRoomId] = useState("");
  const [otp, setOtp] = useState("");
  const [verified, setVerified] = useState(false);
  const [programName, setProgramName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [completion, setCompletion] = useState<ReturnType<
    typeof getRoomCompletion
  >>(null);

  useEffect(() => {
    setClientKey(getOrCreateClientKey());
  }, []);

  useEffect(() => {
    if (!useProgramLink || !programId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_program_check_in_public", {
        p_program_id: programId,
      });
      if (cancelled || error) return;
      const payload = data as { ok: boolean; program_name?: string };
      if (payload.ok && payload.program_name) {
        setProgramName(payload.program_name);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [programId, useProgramLink]);

  useEffect(() => {
    if (!roomId || useProgramLink) return;
    setSessionRoomId(roomId);
    setCompletion(getRoomCompletion(roomId));
  }, [roomId, useProgramLink]);

  const effectiveRoomId = sessionRoomId || (!useProgramLink ? roomId : "");

  const loadMembers = useCallback(async () => {
    if (!effectiveRoomId) return;
    const { data, error } = await supabase.rpc("get_attendance_room_members", {
      p_room_id: effectiveRoomId,
      p_client_key: clientKey,
    });
    if (error) throw error;
    const payload = data as { ok: boolean; error?: string; members?: RoomMember[] };
    if (!payload.ok) {
      throw new Error(errorMessage(payload.error ?? "unknown"));
    }
    setMembers(payload.members ?? []);
  }, [effectiveRoomId, clientKey]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (completion) return;
    setMessage(null);
    const trimmed = otp.replace(/\D/g, "").slice(0, 6);
    if (trimmed.length !== 6) {
      setMessage("Enter the 6-digit code from your teacher.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = useProgramLink
        ? await supabase.rpc("verify_attendance_room_otp_by_program", {
            p_program_id: programId,
            p_otp: trimmed,
            p_client_key: clientKey,
          })
        : await supabase.rpc("verify_attendance_room_otp", {
            p_room_id: roomId,
            p_otp: trimmed,
            p_client_key: clientKey,
          });
      if (error) throw error;
      const result = data as VerifyResult;
      if (!result.ok) {
        setMessage(errorMessage(result.error, result.attempts_left));
        if (result.error === "locked") setOtp("");
        return;
      }

      const resolvedRoomId = result.room_id;
      setSessionRoomId(resolvedRoomId);
      setProgramName(result.program_name);
      setExpiresAt(result.expires_at);

      const existing = getRoomCompletion(resolvedRoomId);
      if (existing) {
        setCompletion(existing);
        return;
      }

      const { data: membersData, error: membersError } = await supabase.rpc(
        "get_attendance_room_members",
        {
          p_room_id: resolvedRoomId,
          p_client_key: clientKey,
        },
      );
      if (membersError) throw membersError;
      const membersPayload = membersData as {
        ok: boolean;
        error?: string;
        members?: RoomMember[];
      };
      if (!membersPayload.ok) {
        setMessage(errorMessage(membersPayload.error ?? "unknown"));
        return;
      }
      setMembers(membersPayload.members ?? []);
      setVerified(true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (verified && effectiveRoomId && clientKey) {
      loadMembers();
    }
  }, [verified, effectiveRoomId, clientKey, loadMembers]);

  const handleMarkPresent = async () => {
    if (!selectedMemberId || completion || !effectiveRoomId) return;
    setMessage(null);
    setLoading(true);
    try {
      const arrivalTime = new Date().toTimeString().slice(0, 8);
      const { data, error } = await supabase.rpc("mark_attendance_room_present", {
        p_room_id: effectiveRoomId,
        p_client_key: clientKey,
        p_member_id: selectedMemberId,
        p_arrival_time: arrivalTime,
      });
      if (error) throw error;
      const payload = data as { ok: boolean; error?: string };
      if (!payload.ok) {
        setMessage(errorMessage(payload.error ?? "unknown"));
        return;
      }
      const member = members.find((m) => m.member_id === selectedMemberId);
      const memberName = member
        ? `${member.first_name} ${member.last_name}`.trim()
        : "Member";
      const done = {
        roomId: effectiveRoomId,
        memberId: selectedMemberId,
        memberName,
        markedAt: new Date().toISOString(),
        expiresAt,
      };
      saveRoomCompletion(done);
      setCompletion(done);
      setMessage(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not mark present.");
    } finally {
      setLoading(false);
    }
  };

  const memberOptions = useMemo(
    () =>
      members.map((m) => ({
        id: m.member_id,
        label: `${m.first_name} ${m.last_name}`.trim(),
        disabled: m.already_present,
      })),
    [members],
  );

  if (!linkId) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">Invalid link</h1>
        <p className="text-zinc-600">
          Use the program attendance link from your teacher (bookmark it once).
        </p>
      </div>
    );
  }

  if (completion) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-emerald-800">All set</h1>
        <p className="text-zinc-700">
          {completion.memberName}, your attendance for this session is already
          recorded.
        </p>
        <p className="text-sm text-zinc-500">
          Recorded at {new Date(completion.markedAt).toLocaleString()}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-12">
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Mark attendance
        </h1>
        {programName ? (
          <p className="mt-2 text-lg font-medium text-zinc-800">{programName}</p>
        ) : null}
        <p className="mt-2 text-sm text-zinc-600">
          Enter today&apos;s 6-digit code from your teacher, then find your name.
        </p>
      </header>

      {message ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {message}
        </p>
      ) : null}

      {!verified ? (
        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium text-zinc-800">
            Today&apos;s code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-center text-2xl tracking-[0.4em] text-zinc-900 caret-zinc-900 placeholder:text-zinc-400 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 [color-scheme:light]"
              placeholder="000000"
            />
          </label>
          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="rounded-xl bg-amber-400 px-4 py-3 font-semibold text-zinc-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Checking…" : "Continue"}
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Program</p>
            <p className="text-lg font-semibold text-zinc-900">{programName}</p>
          </div>

          <MemberSearchPicker
            options={memberOptions}
            value={selectedMemberId}
            onChange={setSelectedMemberId}
            placeholder="Type to search your name…"
          />

          <button
            type="button"
            onClick={handleMarkPresent}
            disabled={loading || !selectedMemberId}
            className="rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Saving…" : "I am present"}
          </button>
        </div>
      )}
    </div>
  );
}
