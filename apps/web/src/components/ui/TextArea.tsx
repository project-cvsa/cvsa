import clsx from "clsx";
import {
	type ComponentProps,
	createEffect,
	createSignal,
	createUniqueId,
	onMount,
	Show,
	splitProps,
} from "solid-js";

export type TextAreaProps = Omit<ComponentProps<"textarea">, "placeholder" | "value" | "rows"> & {
	value?: string;
	defaultValue?: string;
	label?: string;
	placeholder?: string;
	helperText?: string;
	errorText?: string;
	minRows?: number;
	maxRows?: number;
	autoResize?: boolean;
	showCount?: boolean;
};

const LINE_HEIGHT = 25;
const VERTICAL_PADDING = 30;

export default function TextArea(props: TextAreaProps) {
	const [local, rest] = splitProps(props, [
		"class",
		"id",
		"value",
		"defaultValue",
		"label",
		"placeholder",
		"helperText",
		"errorText",
		"minRows",
		"maxRows",
		"autoResize",
		"showCount",
		"maxLength",
		"disabled",
		"required",
		"aria-describedby",
	]);

	const uid = createUniqueId();
	const textareaId = () => local.id ?? uid;
	const errorId = () => `${textareaId()}-error`;
	const helperId = () => `${textareaId()}-helper`;
	const countId = () => `${textareaId()}-count`;
	const minimumRows = () => Math.max(2, local.minRows ?? 3);
	const maximumRows = () => Math.max(minimumRows(), local.maxRows ?? 10);
	const hasError = () => Boolean(local.errorText);

	let textareaRef: HTMLTextAreaElement | undefined;
	const [count, setCount] = createSignal((local.value ?? local.defaultValue ?? "").length);

	const resize = () => {
		const textarea = textareaRef;
		if (!textarea || local.autoResize === false) return;
		const maximumHeight = maximumRows() * LINE_HEIGHT + VERTICAL_PADDING;
		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(textarea.scrollHeight, maximumHeight)}px`;
		textarea.style.overflowY = textarea.scrollHeight > maximumHeight ? "auto" : "hidden";
	};

	createEffect(() => {
		if (local.value === undefined) return;
		setCount(local.value.length);
		queueMicrotask(resize);
	});

	onMount(() => {
		const textarea = textareaRef;
		if (!textarea) return;
		if (local.value === undefined && local.defaultValue !== undefined) {
			textarea.value = local.defaultValue;
		}
		setCount(textarea.value.length);
		resize();
		textarea.addEventListener("input", () => {
			setCount(textarea.value.length);
			resize();
		});
	});

	const describedBy = () => {
		const ids: string[] = [];
		if (hasError()) {
			ids.push(errorId());
		} else if (local.helperText) {
			ids.push(helperId());
		}
		if (local.showCount) ids.push(countId());
		if (local["aria-describedby"]) ids.push(local["aria-describedby"]);
		return ids.length > 0 ? ids.join(" ") : undefined;
	};

	return (
		<div class={clsx("flex flex-col gap-1.5", local.class)}>
			<div
				class={clsx(
					"relative bg-surface border transition-colors",
					hasError()
						? "border-error"
						: "border-border hover:border-tertiary focus-within:border-primary",
					local.disabled && "opacity-60"
				)}
			>
				<Show when={local.label}>
					{(label) => (
						<label
							for={textareaId()}
							class={clsx(
								"absolute left-4 top-2 z-1 cursor-text ts-caption",
								hasError() ? "text-error" : "text-tertiary"
							)}
						>
							{label()}
							<Show when={local.required}>
								<span class="text-error"> *</span>
							</Show>
						</label>
					)}
				</Show>

				<textarea
					ref={textareaRef}
					{...rest}
					id={textareaId()}
					value={local.value}
					rows={minimumRows()}
					maxlength={local.maxLength}
					disabled={local.disabled}
					required={local.required}
					placeholder={local.placeholder}
					aria-invalid={hasError() || undefined}
					aria-describedby={describedBy()}
					class={clsx(
						"box-border block w-full resize-y bg-transparent px-4 pb-3 outline-none ts-body text-primary",
						"placeholder:text-tertiary disabled:cursor-not-allowed",
						local.label ? "pt-7" : "pt-3.5",
						local.autoResize !== false && "resize-none"
					)}
					style={{ "min-height": `${minimumRows() * LINE_HEIGHT + VERTICAL_PADDING}px` }}
				/>
			</div>

			<div class="flex min-h-4 items-start justify-between gap-4">
				<div class="min-w-0 flex-1">
					<Show when={hasError()}>
						<p id={errorId()} class="ts-caption text-error">
							{local.errorText}
						</p>
					</Show>
					<Show when={!hasError() && local.helperText}>
						<p id={helperId()} class="ts-caption text-tertiary">
							{local.helperText}
						</p>
					</Show>
				</div>
				<Show when={local.showCount}>
					<span
						id={countId()}
						class="shrink-0 ts-caption text-quaternary"
						aria-live="polite"
					>
						{count()}
						<Show when={local.maxLength}>/{local.maxLength}</Show>
					</span>
				</Show>
			</div>
		</div>
	);
}
