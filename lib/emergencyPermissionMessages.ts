export function emergencyPermissionErrorMessage(
  code: string,
  ctx?: { deadline?: string; limit?: number; remaining?: number },
): string {
  switch (code) {
    case "feature_disabled":
      return "Emergency permission requests are not enabled for this program.";
    case "program_not_found":
      return "Invalid program link.";
    case "not_enrolled":
      return "You are not enrolled in this program.";
    case "deadline_passed":
      return ctx?.deadline
        ? `The submission window for this date closed on ${ctx.deadline}.`
        : "The submission deadline for this date has passed.";
    case "duplicate_request":
      return "You already submitted a permission request for this date.";
    case "monthly_limit_reached":
      return ctx?.limit != null
        ? `You have used all ${ctx.limit} emergency requests for this month.`
        : "Monthly emergency request limit reached.";
    case "reason_required":
      return "Please enter a short reason (at least 3 characters).";
    case "invalid_permission_type":
      return "Select whether you expect to be absent or late.";
    default:
      return "Something went wrong. Please try again.";
  }
}