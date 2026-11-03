import Badge, { type BadgeSize, type BadgeVariant } from "@components/ui/Badge";
import { getComponentT } from "@lib/i18n/isomorphic";

type StatePresentation = { key: string; variant: BadgeVariant };
const JOB_STATES: Readonly<Record<string, StatePresentation>> = {
	active: { key: "audit.active", variant: "info" },
	waiting: { key: "audit.waiting", variant: "neutral" },
	delayed: { key: "audit.delayed", variant: "warning" },
	failed: { key: "audit.failed", variant: "danger" },
	completed: { key: "audit.completed", variant: "success" },
	prioritized: { key: "audit.waiting", variant: "neutral" },
	"waiting-children": { key: "audit.waitingChildren", variant: "neutral" },
	paused: { key: "audit.paused", variant: "warning" },
	unknown: { key: "common.unknown", variant: "neutral" },
};
const TRACKING_STATES: Readonly<Record<string, StatePresentation>> = {
	new: { key: "videos.state.new", variant: "info" },
	regular: { key: "videos.state.regular", variant: "neutral" },
	milestone: { key: "videos.state.milestone", variant: "warning" },
	archive: { key: "videos.state.archive", variant: "neutral" },
};

export default function StateBadge(props: {
	state: string;
	kind: "job" | "tracking";
	size?: BadgeSize;
}) {
	const t = getComponentT("crawler");
	const presentation = () => (props.kind === "job" ? JOB_STATES : TRACKING_STATES)[props.state];
	return (
		<Badge size={props.size ?? "sm"} variant={presentation()?.variant ?? "neutral"}>
			{presentation() ? t(presentation()?.key ?? "common.unknown") : props.state}
		</Badge>
	);
}
