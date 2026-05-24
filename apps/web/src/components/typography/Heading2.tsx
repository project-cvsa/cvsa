import { type ComponentProps, splitProps } from "solid-js";

export interface Heading2Props extends ComponentProps<"h2"> {}

export default function Heading2(props: Heading2Props) {
	const [local, rest] = splitProps(props, ["class", "children"]);

	return (
		<h2 class={`color-display ts-heading-2 pt-7.5 ${local.class ?? ""}`} {...rest}>
			{local.children}
		</h2>
	);
}
