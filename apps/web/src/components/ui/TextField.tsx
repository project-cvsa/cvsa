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
import Icon, { type IconName } from "./Icon";

type TextFieldSize = "sm" | "md" | "lg";

type TextFieldBaseProps = Omit<ComponentProps<"input">, "placeholder" | "size" | "value"> & {
	size?: TextFieldSize;
	value?: string;
	defaultValue?: string;
	label?: string;
	placeholder?: string;
	helperText?: string;
	errorText?: string;
	leadingIcon?: IconName;
	trailingIcon?: IconName;
	clearLabel?: string;
};

export type TextFieldProps = TextFieldBaseProps &
	(
		| { label: string; placeholder?: undefined; size?: undefined }
		| { label?: undefined; placeholder?: string; size?: TextFieldSize }
		| { label?: undefined; placeholder?: undefined; size?: TextFieldSize }
	);

const heightClass: Record<TextFieldSize, string> = {
	sm: "h-9",
	md: "h-11",
	lg: "h-14",
};

export default function TextField(props: TextFieldProps) {
	const [local, rest] = splitProps(props, [
		"class",
		"id",
		"size",
		"label",
		"placeholder",
		"helperText",
		"errorText",
		"leadingIcon",
		"trailingIcon",
		"clearLabel",
		"disabled",
		"required",
		"value",
		"defaultValue",
		"aria-describedby",
	]);

	if (import.meta.env.DEV && local.label && local.placeholder) {
		console.error("[TextField] label 与 placeholder 互斥，同时传入时 placeholder 会被忽略。");
	}

	const uid = createUniqueId();
	const inputId = () => local.id ?? uid;
	const errorId = () => `${inputId()}-error`;
	const helperId = () => `${inputId()}-helper`;
	const hasError = () => Boolean(local.errorText);
	const hasLabel = () => Boolean(local.label);

	let inputRef: HTMLInputElement | undefined;
	const [isFocused, setIsFocused] = createSignal(false);
	const [typed, setTyped] = createSignal(Boolean(local.value ?? local.defaultValue));

	createEffect(() => {
		if (local.value !== undefined) {
			setTyped(Boolean(local.value));
		}
	});

	onMount(() => {
		const input = inputRef;
		if (!input) return;
		if (local.value === undefined && local.defaultValue !== undefined) {
			input.value = local.defaultValue;
		}
		setTyped(Boolean(input.value));
		input.addEventListener("focusin", () => setIsFocused(true));
		input.addEventListener("focusout", () => setIsFocused(false));
		input.addEventListener("input", () => setTyped(Boolean(input.value)));
	});

	const clearValue = () => {
		if (!inputRef || local.disabled || !inputRef.value) return;
		inputRef.value = "";
		inputRef.dispatchEvent(new InputEvent("input", { bubbles: true }));
	};

	const isFloated = () => hasLabel() && (isFocused() || typed());

	const describedBy = () => {
		const ids: string[] = [];
		if (hasError()) {
			ids.push(errorId());
		} else if (local.helperText) {
			ids.push(helperId());
		}
		if (local["aria-describedby"]) {
			ids.push(local["aria-describedby"]);
		}
		return ids.length > 0 ? ids.join(" ") : undefined;
	};

	const boxClass = () => {
		const border = hasError() ? "border-error" : "border-border";
		const interactive =
			hasError() || local.disabled ? "" : "hover:border-tertiary focus-within:border-primary";
		return clsx(border, interactive);
	};

	return (
		<div class={clsx("flex flex-col gap-1.5", local.class)}>
			<div
				class={clsx(
					"relative flex items-center bg-surface border transition-colors",
					hasLabel() ? "h-[58px]" : heightClass[local.size ?? "md"],
					boxClass(),
					local.disabled && "opacity-60"
				)}
			>
				<Show when={local.leadingIcon}>
					{(icon) => (
						<span class="flex shrink-0 pl-3 pr-1.5 text-quaternary" aria-hidden="true">
							<Icon name={icon()} size={18} />
						</span>
					)}
				</Show>

				<div class="relative h-full min-w-0 flex-1">
					<Show when={hasLabel()}>
						<label
							for={inputId()}
							class={clsx(
								"absolute cursor-text transition-all duration-150",
								local.leadingIcon ? "left-2" : "left-4",
								isFloated()
									? "top-2 leading-none ts-caption"
									: "top-1/2 -translate-y-1/2 ts-body",
								hasError() ? "text-error" : "text-tertiary"
							)}
						>
							{local.label}
							<Show when={local.required}>
								<span class="text-error"> *</span>
							</Show>
						</label>
					</Show>

					<input
						ref={inputRef}
						{...rest}
						id={inputId()}
						value={local.value}
						disabled={local.disabled}
						required={local.required}
						placeholder={hasLabel() ? undefined : local.placeholder}
						aria-invalid={hasError() || undefined}
						aria-describedby={describedBy()}
						class={clsx(
							"box-border h-full w-full min-w-0 appearance-none bg-transparent outline-none text-body",
							local.leadingIcon ? "pl-1" : "pl-4",
							local.trailingIcon ? "pr-1" : "pr-4",
							"placeholder:text-tertiary disabled:cursor-not-allowed",
							hasLabel() && "pt-[21px] pb-1"
						)}
					/>
				</div>

				<Show when={local.trailingIcon === "clear"}>
					<button
						type="button"
						class="flex shrink-0 p-1.5 mr-2 text-quaternary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
						disabled={local.disabled || !typed()}
						aria-label={local.clearLabel}
						onclick={clearValue}
					>
						<Icon name="clear" size={18} />
					</button>
				</Show>
				{local.trailingIcon && local.trailingIcon !== "clear" ? (
					<span class="flex shrink-0 pl-1.5 pr-3 text-quaternary" aria-hidden="true">
						<Icon name={local.trailingIcon} size={18} />
					</span>
				) : null}
			</div>

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
	);
}
