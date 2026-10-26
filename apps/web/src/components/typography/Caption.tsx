import { type ComponentProps, splitProps } from "solid-js";

export interface CaptionProps extends ComponentProps<"span"> {}

export default function Caption(props: CaptionProps) {
	const [local, rest] = splitProps(props, ["class", "children"]);

	return (
		<span class={`ts-caption color-tertiary ${local.class ?? ""}`} {...rest}>
			{local.children}
		</span>
	);
}
