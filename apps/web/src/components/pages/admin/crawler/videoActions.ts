import type { VideoTrackingDto } from "@cvsa/contracts";

export function createRequestSequence() {
	let sequence = 0;
	return {
		start: () => {
			sequence += 1;
			return sequence;
		},
		isCurrent: (request: number) => request === sequence,
	};
}

export function getMilestoneActionAid(
	tracking: Pick<VideoTrackingDto, "aid"> | null,
	loading: boolean
): string | null {
	if (loading || !tracking) return null;
	return tracking.aid;
}
