"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { emergencyPermissionErrorMessage } from "@/lib/emergencyPermissionMessages";
import MemberSearchPicker from "./MemberSearchPicker";

type MemberRow = {
  member_id: string;
  first_name: string;
  last_name: string;
};

type ProgramInfo = {
  program_name: string;
  monthly_limit: number;
  submission_days_after: number;
  enabled: boolean;
};

type StatusPayload = {
  monthly_limit: number;
  used_this_month: number;
  remaining: number;
  submission_deadline: string;
  can_submit: boolean;
  existing_permission_type: string | null;
  deadline_passed: boolean;
  monthly_limit_reached: boolean;
};

const PERMISSION_OPTIONS = [
  { id: "excused_absence", label: "I cannot attend (excused absence)" },
  { id: "excused_lateness", label: "I may arrive late (excused lateness)" },
] as const;

type Props = {
  programId: string;
};

function todayDateInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(isoDate: string) {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function EmergencyPermissionClient({ programId }: Props) {
  const [program, setProgram] = useState<ProgramInfo | null>(null);
  const [programError, setProgramError] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [attendanceDate, setAttendanceDate] = useState(todayDateInputValue);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [permissionType, setPermissionType] = useState<string>("excused_absence");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!programId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setProgramError(null);
      try {
        const { data, error } = await supabase.rpc("get_emergency_permission_program", {
          p_program_id: programId,
        });
        if (error) throw error;
        const payload = data as {
          ok: boolean;
          error?: string;
          program_name?: string;
          monthly_limit?: number;
          submission_days_after?: number;
          enabled?: boolean;
        };
        if (cancelled) return;
        if (!payload.ok) {
          setProgramError(emergencyPermissionErrorMessage(payload.error ?? "unknown"));
          return;
        }
        setProgram({
          program_name: payload.program_name ?? "Program",
          monthly_limit: payload.monthly_limit ?? 0,
          submission_days_after: payload.submission_days_after ?? 1,
          enabled: Boolean(payload.enabled),
        });

        const { data: membersData, error: membersError } = await supabase.rpc(
          "get_emergency_permission_members",
          { p_program_id: programId },
        );
        if (membersError) throw membersError;
        const membersPayload = membersData as {
          ok: boolean;
          members?: MemberRow[];
        };
        if (membersPayload.ok) {
          setMembers(membersPayload.members ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setProgramError(
            err instanceof Error ? err.message : "Could not load program.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [programId]);

  const refreshStatus = useCallback(async () => {
    if (!programId || !selectedMemberId || !attendanceDate) {
      setStatus(null);
      setStatusError(null);
      return;
    }
    try {
      const { data, error } = await supabase.rpc("get_emergency_permission_status", {
        p_program_id: programId,
        p_member_id: selectedMemberId,
        p_attendance_date: attendanceDate,
      });
      if (error) throw error;
      const payload = data as { ok: boolean; error?: string } & StatusPayload;
      if (!payload.ok) {
        setStatus(null);
        setStatusError(emergencyPermissionErrorMessage(payload.error ?? "unknown"));
        return;
      }
      setStatusError(null);
      setStatus({
        monthly_limit: payload.monthly_limit,
        used_this_month: payload.used_this_month,
        remaining: payload.remaining,
        submission_deadline: payload.submission_deadline,
        can_submit: payload.can_submit,
        existing_permission_type: payload.existing_permission_type,
        deadline_passed: payload.deadline_passed,
        monthly_limit_reached: payload.monthly_limit_reached,
      });
    } catch (err) {
      setStatus(null);
      setStatusError(
        err instanceof Error ? err.message : "Could not load allowance.",
      );
    }
  }, [programId, selectedMemberId, attendanceDate]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const memberOptions = useMemo(
    () =>
      members.map((m) => ({
        id: m.member_id,
        label: `${m.first_name} ${m.last_name}`.trim(),
      })),
    [members],
  );

  const canSubmit =
    Boolean(program?.enabled)
    && Boolean(selectedMemberId)
    && Boolean(attendanceDate)
    && reason.trim().length >= 3
    && Boolean(permissionType)
    && (status?.can_submit ?? false)
    && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setMessage(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("submit_emergency_permission_request", {
        p_program_id: programId,
        p_member_id: selectedMemberId,
        p_attendance_date: attendanceDate,
        p_permission_type: permissionType,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      const payload = data as {
        ok: boolean;
        error?: string;
        submission_deadline?: string;
        monthly_limit?: number;
        remaining?: number;
      };
      if (!payload.ok) {
        setMessage(
          emergencyPermissionErrorMessage(payload.error ?? "unknown", {
            deadline: payload.submission_deadline,
            limit: payload.monthly_limit,
            remaining: payload.remaining,
          }),
        );
        await refreshStatus();
        return;
      }
      const member = members.find((m) => m.member_id === selectedMemberId);
      const name = member
        ? `${member.first_name} ${member.last_name}`.trim()
        : "Your";
      setSuccess(
        `${name} permission for ${formatDisplayDate(attendanceDate)} was submitted. Teachers will see the excused status when attendance is recorded.`,
      );
      setReason("");
      await refreshStatus();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!programId) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">Invalid link</h1>
        <p className="text-zinc-600">
          Use the permission link from your teacher with{" "}
          <code className="text-sm">?program=…</code> in the URL.
        </p>
      </div>
    );
  }

  if (loading && !program) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-zinc-600">
        Loading program…
      </div>
    );
  }

  if (programError) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">Unable to open</h1>
        <p className="text-red-800">{programError}</p>
      </div>
    );
  }

  if (program && !program.enabled) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">{program.program_name}</h1>
        <p className="text-zinc-600">
          Emergency permission requests are not enabled for this program. Contact your
          administrator.
        </p>
        <Link
          href={`/?program=${encodeURIComponent(programId)}`}
          className="text-sm font-medium text-amber-700 underline"
        >
          Go to attendance check-in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-12">
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Permission request
        </h1>
        {program ? (
          <p className="mt-2 text-lg font-medium text-zinc-800">{program.program_name}</p>
        ) : null}
        <p className="mt-2 text-sm text-zinc-600">
          Request a one-time excused absence or excused lateness for a specific session.
        </p>
        <Link
          href={`/?program=${encodeURIComponent(programId)}`}
          className="mt-3 inline-block text-sm font-medium text-amber-700 underline"
        >
          Mark attendance instead
        </Link>
      </header>

      {success ? (
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          {success}
        </p>
      ) : null}

      {message ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {message}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm font-medium text-zinc-800">
          Session date
          <input
            type="date"
            value={attendanceDate}
            onChange={(e) => setAttendanceDate(e.target.value)}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 [color-scheme:light]"
            required
          />
        </label>

        <MemberSearchPicker
          options={memberOptions}
          value={selectedMemberId}
          onChange={setSelectedMemberId}
          placeholder="Type to find your name…"
          label="Your name"
        />

        {status || statusError ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            {statusError ? (
              <p className="text-amber-900">{statusError}</p>
            ) : status ? (
              <>
                <p>
                  <span className="font-medium text-zinc-900">
                    {status.remaining}
                  </span>{" "}
                  of {status.monthly_limit} emergency request
                  {status.monthly_limit === 1 ? "" : "s"} left this month (
                  {status.used_this_month} used).
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Submit through {formatDisplayDate(status.submission_deadline)} for
                  this session.
                </p>
                {status.existing_permission_type ? (
                  <p className="mt-2 font-medium text-emerald-800">
                    You already have permission for this date.
                  </p>
                ) : status.deadline_passed ? (
                  <p className="mt-2 text-amber-800">Submission deadline has passed.</p>
                ) : status.monthly_limit_reached ? (
                  <p className="mt-2 text-amber-800">Monthly limit reached.</p>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-zinc-800">Permission type</legend>
          {PERMISSION_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 px-4 py-3 has-[:checked]:border-amber-400 has-[:checked]:bg-amber-50"
            >
              <input
                type="radio"
                name="permission_type"
                value={opt.id}
                checked={permissionType === opt.id}
                onChange={() => setPermissionType(opt.id)}
                className="mt-1"
              />
              <span className="text-sm text-zinc-800">{opt.label}</span>
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-2 text-sm font-medium text-zinc-800">
          Reason
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Briefly explain why you cannot attend or may be late…"
            className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            required
            minLength={3}
          />
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit permission request"}
        </button>
      </form>
    </div>
  );
}