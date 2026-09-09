import { type ComponentProps, type JSX, splitProps } from "solid-js";

export type IconName = "search" | "clear" | "menu" | "visibility" | "visibility-off";

function SearchIcon(): JSX.Element {
	return (
		<>
			<circle cx="11" cy="11" r="7" />
			<line x1="21" y1="21" x2="16.65" y2="16.65" />
		</>
	);
}

function ClearIcon(): JSX.Element {
	return (
		<>
			<line x1="18" y1="6" x2="6" y2="18" />
			<line x1="6" y1="6" x2="18" y2="18" />
		</>
	);
}

function MenuIcon(): JSX.Element {
	return (
		<>
			<line x1="3" y1="6" x2="21" y2="6" />
			<line x1="3" y1="12" x2="21" y2="12" />
			<line x1="3" y1="18" x2="21" y2="18" />
		</>
	);
}

function VisibilityIcon(): JSX.Element {
	return (
		<>
			<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
			<circle cx="12" cy="12" r="3" />
		</>
	);
}

function VisibilityOffIcon(): JSX.Element {
	return (
		<>
			<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.53 9.53a3 3 0 1 0 4.95 4.95" />
			<path d="M1 1l22 22" />
			<path d="M14.12 14.12a3 3 0 0 1-4.24-4.24" />
		</>
	);
}

const iconMap: Record<IconName, () => JSX.Element> = {
	search: SearchIcon,
	clear: ClearIcon,
	menu: MenuIcon,
	visibility: VisibilityIcon,
	"visibility-off": VisibilityOffIcon,
};

export interface IconProps extends ComponentProps<"svg"> {
	name: IconName;
	size?: number;
	title?: string;
}

export default function Icon(props: IconProps) {
	const [local, rest] = splitProps(props, ["name", "size", "title", "class"]);

	const size = () => local.size ?? 20;

	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={size()}
			height={size()}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			role="img"
			aria-hidden={local.title ? undefined : true}
			aria-label={local.title}
			class={local.class}
			{...rest}
		>
			{local.title ? <title>{local.title}</title> : null}
			{iconMap[local.name]()}
		</svg>
	);
}

export const iconNames = Object.keys(iconMap) as IconName[];
