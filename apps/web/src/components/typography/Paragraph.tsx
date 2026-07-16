import { type ComponentProps, splitProps } from "solid-js";

export interface ParagraphProps extends ComponentProps<"p"> {}

export default function Paragraph(props: ParagraphProps) {
	const [local, rest] = splitProps(props, ["class", "children"]);

	return (
		<p class={`ts-body color-primary pt-3.5 ${local.class ?? ""}`} {...rest}>
			{local.children}
		</p>
	);
}
