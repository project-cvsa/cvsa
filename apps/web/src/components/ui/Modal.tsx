import { cn } from "@lib/cn";
import { Dialog } from "@ark-ui/solid/dialog";
import { cva, type VariantProps } from "class-variance-authority";
import X from "lucide-solid/icons/x";
import { type JSX, Show, splitProps } from "solid-js";
import { Portal } from "solid-js/web";

const modalContentVariants = cva(
	"cvsa-modal-content pointer-events-auto relative w-full max-h-[calc(100dvh-2rem)] flex flex-col bg-surface shadow-xl overflow-hidden outline-none",
	{
		variants: {
			size: {
				sm: "max-w-md",
				md: "max-w-lg",
				lg: "max-w-2xl",
				xl: "max-w-4xl",
			},
		},
		defaultVariants: {
			size: "md",
		},
	}
);

export interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	closeLabel?: string;
	title?: string | JSX.Element;
	description?: string | JSX.Element;
	size?: NonNullable<VariantProps<typeof modalContentVariants>["size"]>;
	children?: JSX.Element;
	footer?: JSX.Element;
	class?: string;
}

export default function Modal(props: ModalProps) {
	const [local, rest] = splitProps(props, [
		"isOpen",
		"onClose",
		"closeLabel",
		"title",
		"description",
		"size",
		"children",
		"footer",
		"class",
	]);

	const size = () => local.size ?? "md";

	return (
		<Dialog.Root
			open={local.isOpen}
			onOpenChange={(details) => {
				if (!details.open) local.onClose();
			}}
			lazyMount
			unmountOnExit
		>
			<Portal>
				<Dialog.Backdrop class="cvsa-modal-backdrop fixed inset-0 z-50 bg-scrim backdrop-blur-sm" />
				<Dialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
					<Dialog.Content
						class={cn(modalContentVariants({ size: size() }), local.class)}
						{...rest}
					>
						<div class="h-12 shrink-0 bg-primary text-display-inverted px-6 flex items-center justify-between gap-4 uppercase text-body tracking-body">
							<Show when={local.title}>
								<Dialog.Title class="font-semibold text-display-inverted truncate text-body tracking-body">
									{local.title}
								</Dialog.Title>
							</Show>
							<Dialog.CloseTrigger
								type="button"
								class="w-8 h-8 -mr-2 inline-flex items-center justify-center text-display-inverted/80 hover:text-display-inverted hover:bg-display-inverted/15 transition-colors cursor-pointer focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-display-inverted"
								aria-label={local.closeLabel ?? "Close"}
							>
								<X class="w-5 h-5" />
							</Dialog.CloseTrigger>
						</div>

						<div class="cvsa-scroll p-6 min-h-0 overflow-y-auto">
							<Show when={local.description}>
								<Dialog.Description class="text-label tracking-label text-secondary mb-4">
									{local.description}
								</Dialog.Description>
							</Show>
							{local.children}
						</div>

						<Show when={local.footer}>
							<div class="shrink-0 px-6 py-4 border-t border-border bg-surface flex items-center justify-end gap-3">
								{local.footer}
							</div>
						</Show>
					</Dialog.Content>
				</Dialog.Positioner>
			</Portal>
		</Dialog.Root>
	);
}
