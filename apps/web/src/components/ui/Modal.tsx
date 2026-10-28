import clsx from "clsx";
import { type JSX, Show, onCleanup, onMount, splitProps } from "solid-js";
import { Portal } from "solid-js/web";
import X from "lucide-solid/icons/x";

export interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	closeLabel?: string;
	title?: string | JSX.Element;
	description?: string | JSX.Element;
	size?: "sm" | "md" | "lg" | "xl";
	children?: JSX.Element;
	footer?: JSX.Element;
	class?: string;
}

const sizeStyles = {
	sm: "max-w-md",
	md: "max-w-lg",
	lg: "max-w-2xl",
	xl: "max-w-4xl",
};

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

	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === "Escape" && local.isOpen && !event.defaultPrevented) {
			local.onClose();
		}
	};

	onMount(() => {
		if (typeof window === "undefined") return;
		window.addEventListener("keydown", handleKeyDown);
		onCleanup(() => {
			if (typeof window !== "undefined") {
				window.removeEventListener("keydown", handleKeyDown);
			}
		});
	});

	return (
		<Show when={local.isOpen}>
			<Portal>
				<div
					class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
					role="dialog"
					aria-modal="true"
					tabIndex={-1}
				>
					<div
						class={clsx(
							"relative w-full bg-surface border-2 border-primary shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150",
							sizeStyles[size()],
							local.class
						)}
						{...rest}
					>
						<div class="h-12 bg-primary text-display-inverted px-6 flex items-center justify-between font-[Outfit,system-ui] uppercase text-base">
							<div class="flex items-center gap-3 min-w-0">
								<Show when={local.title}>
									<h2 class="font-semibold text-display-inverted truncate text-base">
										{local.title}
									</h2>
								</Show>
								<Show when={local.description}>
									<span class="ts-caption text-display-inverted/70">
										{local.description}
									</span>
								</Show>
							</div>
							<button
								type="button"
								class="p-1 text-display-inverted hover:bg-hover/20 transition-colors cursor-pointer focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-display-inverted"
								onClick={() => local.onClose()}
								aria-label={local.closeLabel ?? "Close"}
							>
								<X class="w-5 h-5" />
							</button>
						</div>

						<div class="p-6 max-h-[75vh] overflow-y-auto">{local.children}</div>

						<Show when={local.footer}>
							<div class="px-6 py-4 border-t border-border bg-surface-container-high flex items-center justify-end gap-3">
								{local.footer}
							</div>
						</Show>
					</div>
				</div>
			</Portal>
		</Show>
	);
}
