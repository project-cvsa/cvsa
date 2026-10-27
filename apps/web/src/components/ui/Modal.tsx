import clsx from "clsx";
import { type JSX, Show, onCleanup, onMount, splitProps } from "solid-js";
import { Portal } from "solid-js/web";
import X from "lucide-solid/icons/x";

export interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
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
		"title",
		"description",
		"size",
		"children",
		"footer",
		"class",
	]);

	const size = () => local.size ?? "md";

	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === "Escape" && local.isOpen) {
			local.onClose();
		}
	};

	onMount(() => {
		window.addEventListener("keydown", handleKeyDown);
	});

	onCleanup(() => {
		window.removeEventListener("keydown", handleKeyDown);
	});

	return (
		<Show when={local.isOpen}>
			<Portal>
				<div
					class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
					onClick={(e) => {
						if (e.target === e.currentTarget) local.onClose();
					}}
					onKeyDown={handleKeyDown}
					role="dialog"
					aria-modal="true"
					tabIndex={-1}
				>
					<div
						class={clsx(
							"relative w-full rounded-xl bg-surface border border-border shadow-xl overflow-hidden animate-in zoom-in-95 duration-150",
							sizeStyles[size()],
							local.class
						)}
						{...rest}
					>
						<div class="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
							<div class="flex flex-col gap-0.5 min-w-0">
								<Show when={local.title}>
									<h2 class="ts-heading-3 font-semibold text-primary truncate">
										{local.title}
									</h2>
								</Show>
								<Show when={local.description}>
									<p class="ts-caption text-tertiary">{local.description}</p>
								</Show>
							</div>
							<button
								type="button"
								class="p-1 rounded-md text-tertiary hover:text-primary hover:bg-hover transition-colors"
								onClick={() => local.onClose()}
								aria-label="Close"
							>
								<X class="w-5 h-5" />
							</button>
						</div>

						<div class="p-6 max-h-[75vh] overflow-y-auto">{local.children}</div>

						<Show when={local.footer}>
							<div class="px-6 py-4 border-t border-border bg-surface-container-high/20 flex items-center justify-end gap-3">
								{local.footer}
							</div>
						</Show>
					</div>
				</div>
			</Portal>
		</Show>
	);
}
