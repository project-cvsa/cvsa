export type ControlSize = "sm" | "md" | "lg";

export const CONTROL_HEIGHT: Record<ControlSize, string> = {
	sm: "h-8",
	md: "h-10",
	lg: "h-14",
};

export const CONTROL_TEXT: Record<ControlSize, string> = {
	sm: "text-caption tracking-caption",
	md: "text-label tracking-label",
	lg: "text-body tracking-body",
};

export function controlSizeClass(size: ControlSize): string {
	return `${CONTROL_HEIGHT[size]} ${CONTROL_TEXT[size]}`;
}
