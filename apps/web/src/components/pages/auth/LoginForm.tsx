import Button from "@components/ui/Button";
import TextField from "@components/ui/TextField";
import { api } from "@lib/api";
import { createSignal } from "solid-js";

export interface LoginFormProps {
	identifierLabel: string;
	passwordLabel: string;
	submitLabel: string;
	genericError: string;
	networkError: string;
	redirectTo: string;
}

export default function LoginForm(props: LoginFormProps) {
	let formRef: HTMLFormElement | undefined;
	const [passwordError, setPasswordError] = createSignal<string>();
	const [formError, setFormError] = createSignal<string>();
	const [submitting, setSubmitting] = createSignal(false);

	const handleSubmit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (submitting()) return;

		const data = new FormData(formRef);
		const identifier = String(data.get("identifier") ?? "").trim();
		const password = String(data.get("password") ?? "");

		setPasswordError(undefined);
		setFormError(undefined);
		setSubmitting(true);

		const result = await api.auth.login({ email: identifier, password });

		if (result.ok) {
			window.location.assign(props.redirectTo);
			return;
		}

		setSubmitting(false);
		if (result.error.code === "NETWORK_ERROR") {
			setFormError(props.networkError);
			return;
		}
		if (result.error.message) {
			setPasswordError(result.error.message);
			return;
		}
		setFormError(props.genericError);
	};

	return (
		<form ref={formRef} class="flex flex-col gap-3.5" onSubmit={handleSubmit}>
			<TextField
				label={props.identifierLabel}
				name="identifier"
				required
				autocomplete="username"
			/>
			<TextField
				label={props.passwordLabel}
				name="password"
				type="password"
				required
				autocomplete="current-password"
				errorText={passwordError()}
			/>
			<Button type="submit" class="mt-2 h-12 w-full" disabled={submitting()}>
				{props.submitLabel}
			</Button>
			{formError() ? <p class="ts-caption text-error">{formError()}</p> : null}
		</form>
	);
}
