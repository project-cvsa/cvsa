import { cn } from "@lib/cn";
import { type ComponentProps, splitProps } from "solid-js";

export interface DisplayLProps extends ComponentProps<"h1"> {}

export default function DisplayL(props: DisplayLProps) {
	const [local, rest] = splitProps(props, ["class", "children"]);

	return (
		<h1 class={cn("text-display ts-display-large pb-2", local.class)} {...rest}>
			{local.children}
		</h1>
	);
}
