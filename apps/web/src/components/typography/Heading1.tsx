import { cn } from "@lib/cn";
import { type ComponentProps, splitProps } from "solid-js";

export interface Heading1Props extends ComponentProps<"h1"> {}

export default function Heading1(props: Heading1Props) {
	const [local, rest] = splitProps(props, ["class", "children"]);

	return (
		<h1 class={cn("text-display ts-heading-1 pb-2", local.class)} {...rest}>
			{local.children}
		</h1>
	);
}
