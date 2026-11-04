import { OperationCancelledError, OperationTimeoutError } from "../shared/boundedOperation";
import { RetryLaterError } from "../shared/retryLater";
import { TaskDeadlineError } from "../shared/taskContext";
import type { StatsOutcome } from "./types";

/** Classifies an error without inspecting human-readable messages. */
export function outcomeOfError(error: unknown): StatsOutcome {
	if (error instanceof RetryLaterError) return "deferred";
	if (error instanceof TaskDeadlineError || error instanceof OperationTimeoutError)
		return "timeout";
	if (error instanceof OperationCancelledError) return "cancelled";
	if (error instanceof Error && error.name === "AbortError") return "cancelled";
	return "failure";
}
