import { createSignal, For, Show } from "solid-js";
import clsx from "clsx";
import X from "lucide-solid/icons/x";

export interface TagInputProps {
	tags: string[];
	onChange: (tags: string[]) => void;
	placeholder?: string;
	label?: string;
	description?: string;
	maxTags?: number;
	disabled?: boolean;
	class?: string;
}

export default function TagInput(props: TagInputProps) {
	const [input, setInput] = createSignal("");
	let inputRef!: HTMLInputElement;

	const addTokens = (raw: string) => {
		const tokens = raw
			.split(/[,，;\n\r\t]+/)
			.map((t) => t.trim())
			.filter(Boolean);

		if (tokens.length === 0) return;

		const current = new Set(props.tags);
		const next = [...props.tags];

		for (const token of tokens) {
			if (!current.has(token)) {
				if (props.maxTags && next.length >= props.maxTags) break;
				current.add(token);
				next.push(token);
			}
		}

		props.onChange(next);
		setInput("");
	};

	const removeTag = (index: number) => {
		if (props.disabled) return;
		const next = props.tags.filter((_, i) => i !== index);
		props.onChange(next);
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (props.disabled) return;

		if (e.key === "Enter" || e.key === "," || e.key === "，") {
			e.preventDefault();
			addTokens(input());
		} else if (e.key === "Backspace" && !input() && props.tags.length > 0) {
			removeTag(props.tags.length - 1);
		}
	};

	const handlePaste = (e: ClipboardEvent) => {
		if (props.disabled) return;
		const pasteData = e.clipboardData?.getData("text");
		if (
			pasteData &&
			(pasteData.includes(",") || pasteData.includes("，") || pasteData.includes("\n"))
		) {
			e.preventDefault();
			addTokens(pasteData);
		}
	};

	return (
		<div class={clsx("flex flex-col gap-2", props.class)}>
			<Show when={props.label || props.description}>
				<div class="flex items-center justify-between gap-2">
					<Show when={props.label}>
						<div class="flex items-center gap-2">
							<span class="ts-label font-medium text-primary">{props.label}</span>
							<span class="px-1.5 py-0.2 bg-surface-container-high border border-border text-[11px] font-mono text-secondary">
								{props.tags.length}
							</span>
						</div>
					</Show>
					<Show when={props.tags.length > 0 && !props.disabled}>
						<button
							type="button"
							onClick={() => props.onChange([])}
							class="text-[11px] text-tertiary hover:text-error transition-colors cursor-pointer select-none"
						>
							清空全部
						</button>
					</Show>
				</div>
				<Show when={props.description}>
					<p class="text-xs text-tertiary -mt-0.5">{props.description}</p>
				</Show>
			</Show>

			<label
				class={clsx(
					"w-full bg-surface-container-low border border-border p-2 flex flex-wrap items-center gap-1.5 transition-colors cursor-text min-h-[46px]",
					props.disabled
						? "opacity-60 cursor-not-allowed bg-surface-container"
						: "hover:border-secondary focus-within:border-primary focus-within:bg-surface focus-within:ring-1 focus-within:ring-primary/20"
				)}
			>
				<For each={props.tags}>
					{(tag, index) => (
						<span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface border border-border text-xs text-primary font-medium select-none animate-in fade-in zoom-in-95 duration-100">
							<span>{tag}</span>
							<Show when={!props.disabled}>
								<button
									type="button"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										removeTag(index());
									}}
									class="text-tertiary hover:text-error transition-colors cursor-pointer -mr-0.5 p-0.5 rounded-xs"
									aria-label={`移除 ${tag}`}
								>
									<X class="w-3 h-3" />
								</button>
							</Show>
						</span>
					)}
				</For>

				<input
					ref={inputRef}
					type="text"
					value={input()}
					onInput={(e) => setInput(e.currentTarget.value)}
					onKeyDown={handleKeyDown}
					onPaste={handlePaste}
					disabled={props.disabled}
					placeholder={
						props.tags.length === 0
							? props.placeholder || "输入关键词并回车，支持逗号或换行批量粘贴..."
							: "+ 添加..."
					}
					class="flex-1 min-w-[140px] bg-transparent text-xs text-primary placeholder:text-tertiary outline-none py-1 px-1 border-0"
				/>
			</label>
		</div>
	);
}
