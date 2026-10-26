import { type ComponentProps, splitProps } from "solid-js";

export interface Heading3Props extends ComponentProps<"h3"> {}

export default function Heading3(props: Heading3Props) {
	const [local, rest] = splitProps(props, ["class", "children"]);

	return (
		<h3 class={`color-display ts-heading-3 pt-4 ${local.class ?? ""}`} {...rest}>
			{local.children}
		</h3>
	);
}
