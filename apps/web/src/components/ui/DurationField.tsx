import clsx from "clsx";
import { createEffect, createSignal, createUniqueId, Show, splitProps } from "solid-js";

export interface DurationFieldProps {
	id?: string;
	class?: string;
	name?: string;
	value?: number;
	defaultValue?: number;
	label: string;
	minuteLabel: string;
	secondLabel: string;
	helperText?: string;
	errorText?: string;
	disabled?: boolean;
	required?: boolean;
	maxMinutes?: number;
	onValueChange?: (value: number) => void;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function splitDuration(value: number | undefined, maxMinutes: number): [string, string] {
	const totalSeconds = Math.max(0, Math.floor(value ?? 0));
	const minutes = clamp(Math.floor(totalSeconds / 60), 0, maxMinutes);
	const seconds = totalSeconds % 60;
	return [String(minutes), String(seconds).padStart(2, "0")];
}

export default function DurationField(props: DurationFieldProps) {
	const [local] = splitProps(props, [
		"id",
		"class",
		"name",
		"value",
		"defaultValue",
		"label",
		"minuteLabel",
		"secondLabel",
		"helperText",
		"errorText",
		"disabled",
		"required",
		"maxMinutes",
		"onValueChange",
	]);

	const uid = createUniqueId();
	const fieldId = () => local.id ?? uid;
	const minuteId = () => `${fieldId()}-minutes`;
	const secondId = () => `${fieldId()}-seconds`;
	const errorId = () => `${fieldId()}-error`;
	const helperId = () => `${fieldId()}-helper`;
	const maximumMinutes = () => Math.max(0, local.maxMinutes ?? 999);
	const initial = splitDuration(local.value ?? local.defaultValue, maximumMinutes());
	const [minutes, setMinutes] = createSignal(initial[0]);
	const [seconds, setSeconds] = createSignal(initial[1]);
	const hasError = () => Boolean(local.errorText);
	let minuteRef: HTMLInputElement | undefined;
	let secondRef: HTMLInputElement | undefined;

	const numericValue = (value: string) => Number.parseInt(value || "0", 10);
	const totalSeconds = () => numericValue(minutes()) * 60 + numericValue(seconds());

	createEffect(() => {
		if (local.value === undefined) return;
		const next = splitDuration(local.value, maximumMinutes());
		setMinutes(next[0]);
		setSeconds(next[1]);
	});

	const notify = () => local.onValueChange?.(totalSeconds());
	const updateMinutes = (value: string) => {
		const digits = value.replace(/\D/g, "").slice(0, String(maximumMinutes()).length);
		setMinutes(digits);
		queueMicrotask(notify);
	};
	const updateSeconds = (value: string) => {
		const digits = value.replace(/\D/g, "").slice(0, 2);
		setSeconds(digits === "" ? "" : String(clamp(numericValue(digits), 0, 59)));
		queueMicrotask(notify);
	};
	const normalize = () => {
		setMinutes(String(clamp(numericValue(minutes()), 0, maximumMinutes())));
		setSeconds(String(clamp(numericValue(seconds()), 0, 59)).padStart(2, "0"));
		queueMicrotask(notify);
	};
	const step = (segment: "minutes" | "seconds", amount: number) => {
		if (segment === "minutes") {
			setMinutes(String(clamp(numericValue(minutes()) + amount, 0, maximumMinutes())));
		} else {
			const nextTotal = clamp(totalSeconds() + amount, 0, maximumMinutes() * 60 + 59);
			const next = splitDuration(nextTotal, maximumMinutes());
			setMinutes(next[0]);
			setSeconds(next[1]);
		}
		notify();
	};
	const handleKeyDown = (
		event: KeyboardEvent & { currentTarget: HTMLInputElement },
		segment: "minutes" | "seconds"
	) => {
		if (event.key === "ArrowUp") {
			event.preventDefault();
			step(segment, 1);
		}
		if (event.key === "ArrowDown") {
			event.preventDefault();
			step(segment, -1);
		}
		if (event.key === "ArrowRight" && segment === "minutes") {
			event.preventDefault();
			secondRef?.focus();
		}
		if (event.key === "ArrowLeft" && segment === "seconds") {
			event.preventDefault();
			minuteRef?.focus();
		}
	};
	const describedBy = () => {
		if (hasError()) return errorId();
		return local.helperText ? helperId() : undefined;
	};

	return (
		<div class={clsx("flex flex-col gap-1.5", local.class)}>
			<div
				role="group"
				aria-label={local.label}
				class={clsx(
					"group relative flex h-[58px] items-center border bg-surface transition-colors",
					hasError()
						? "border-error"
						: "border-border hover:border-tertiary focus-within:border-primary",
					local.disabled && "opacity-60"
				)}
			>
				<label
					for={minuteId()}
					class={clsx(
						"absolute left-4 top-2 z-1 cursor-text ts-caption",
						hasError() ? "text-error" : "text-tertiary"
					)}
				>
					{local.label}
					<Show when={local.required}>
						<span class="text-error"> *</span>
					</Show>
				</label>

				<label
					for={minuteId()}
					class="flex h-full min-w-0 flex-1 items-end gap-1 overflow-hidden px-4 pb-2 pt-6 outline-none"
				>
					<span class="flex shrink-0 items-baseline gap-0.5">
						<input
							ref={minuteRef}
							id={minuteId()}
							aria-label={local.minuteLabel}
							type="text"
							role="spinbutton"
							inputmode="numeric"
							pattern="[0-9]*"
							value={minutes()}
							required={local.required}
							disabled={local.disabled}
							aria-describedby={describedBy()}
							aria-valuemin="0"
							aria-valuemax={maximumMinutes()}
							aria-valuenow={numericValue(minutes())}
							class="w-[4ch] min-w-0 rounded-none bg-transparent px-0.5 text-center outline-none ts-body text-primary focus:bg-primary focus:text-display-inverted disabled:cursor-not-allowed"
							oninput={(event) => updateMinutes(event.currentTarget.value)}
							onfocus={(event) => event.currentTarget.select()}
							onblur={normalize}
							onkeydown={(event) => handleKeyDown(event, "minutes")}
						/>
						<span class="ts-caption text-tertiary">{local.minuteLabel}</span>
					</span>

					<span class="ml-1.5 flex shrink-0 items-baseline gap-0.5">
						<input
							ref={secondRef}
							id={secondId()}
							aria-label={local.secondLabel}
							type="text"
							role="spinbutton"
							inputmode="numeric"
							pattern="[0-9]*"
							value={seconds()}
							required={local.required}
							disabled={local.disabled}
							aria-describedby={describedBy()}
							aria-valuemin="0"
							aria-valuemax="59"
							aria-valuenow={numericValue(seconds())}
							class="w-[3ch] min-w-0 rounded-none bg-transparent px-0.5 text-center outline-none ts-body text-primary focus:bg-primary focus:text-display-inverted disabled:cursor-not-allowed"
							oninput={(event) => updateSeconds(event.currentTarget.value)}
							onfocus={(event) => event.currentTarget.select()}
							onblur={normalize}
							onkeydown={(event) => handleKeyDown(event, "seconds")}
						/>
						<span class="ts-caption text-tertiary">{local.secondLabel}</span>
					</span>
				</label>

				<input
					type="hidden"
					name={local.name}
					value={totalSeconds()}
					disabled={local.disabled}
				/>
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
