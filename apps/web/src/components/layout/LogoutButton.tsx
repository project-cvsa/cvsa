import { apiRequest } from "@lib/api";
import { createSignal } from "solid-js";

export interface LogoutButtonProps {
	label: string;
}

export default function LogoutButton(props: LogoutButtonProps) {
	const [submitting, setSubmitting] = createSignal(false);

	const handleLogout = async () => {
		if (submitting()) return;
		setSubmitting(true);
		await apiRequest("DELETE", "/v2/session");
		window.location.reload();
	};

	return (
		<button
			type="button"
			class="ts-body shrink-0 cursor-pointer rounded-none text-tertiary hover:text-primary transition-colors disabled:cursor-not-allowed disabled:opacity-60"
			onClick={handleLogout}
			disabled={submitting()}
		>
			{props.label}
		</button>
	);
}
