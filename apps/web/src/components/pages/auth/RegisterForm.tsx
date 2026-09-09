import Button from "@components/ui/Button";
import TextField from "@components/ui/TextField";
import { apiRequest } from "@lib/api";
import { createSignal } from "solid-js";

export interface RegisterFormProps {
	usernameLabel: string;
	emailLabel: string;
	passwordLabel: string;
	passwordHelperText: string;
	submitLabel: string;
	genericError: string;
	networkError: string;
	locale: string;
	redirectTo: string;
}

export default function RegisterForm(props: RegisterFormProps) {
	let formRef: HTMLFormElement | undefined;
	const [usernameError, setUsernameError] = createSignal<string>();
	const [emailError, setEmailError] = createSignal<string>();
	const [passwordError, setPasswordError] = createSignal<string>();
	const [formError, setFormError] = createSignal<string>();
	const [submitting, setSubmitting] = createSignal(false);

	const handleSubmit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (submitting()) return;

		const data = new FormData(formRef);
		const username = String(data.get("username") ?? "").trim();
		const email = String(data.get("email") ?? "").trim();
		const password = String(data.get("password") ?? "");

		setUsernameError(undefined);
		setEmailError(undefined);
		setPasswordError(undefined);
		setFormError(undefined);
		setSubmitting(true);

		const result = await apiRequest("POST", "/v2/user", {
			body: {
				username,
				password,
				...(email ? { email } : {}),
			},
			locale: props.locale,
		});

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
			if (result.error.code === "USERNAME_IS_ALREADY_TAKEN") {
				setUsernameError(result.error.message);
			} else if (result.error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
				setEmailError(result.error.message);
			} else if (result.error.code === "VALIDATION_ERROR") {
				setPasswordError(result.error.message);
			} else {
				setFormError(result.error.message);
			}
			return;
		}
		setFormError(props.genericError);
	};

	return (
		<form ref={formRef} class="flex flex-col gap-3.5" onSubmit={handleSubmit}>
			<TextField
				label={props.usernameLabel}
				name="username"
				required
				autocomplete="username"
				errorText={usernameError()}
			/>
			<TextField
				label={props.emailLabel}
				name="email"
				type="email"
				autocomplete="email"
				errorText={emailError()}
			/>
			<TextField
				label={props.passwordLabel}
				name="password"
				type="password"
				required
				minlength={8}
				autocomplete="new-password"
				helperText={props.passwordHelperText}
				errorText={passwordError()}
			/>
			<Button type="submit" class="mt-2 h-12 w-full" disabled={submitting()}>
				{props.submitLabel}
			</Button>
			{formError() ? <p class="ts-caption text-error">{formError()}</p> : null}
		</form>
	);
}
