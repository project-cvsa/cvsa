import { Portal } from "solid-js/web";
import { type ToastType, Toast, Toaster, createToaster } from "@ark-ui/solid/toast";
import Heading2 from "@components/typography/Heading2";
import "./Toast.css";
import Paragraph from "@components/typography/Paragraph";

const toaster = createToaster({
	placement: "bottom-end",
	overlap: true,
	gap: 24,
	max: 3,
});

type ToastParams = Omit<Parameters<typeof toaster.create>[0], "type">;

function createToast(description: string, type: ToastType, options?: ToastParams) {
	toaster.create({ description, type, ...options });
}

export function ToastContainer() {
	return (
		<Portal>
			<Toaster toaster={toaster}>
				{(toast) => (
					<Toast.Root class="w-fit min-w-20rem max-w-30rem bg-surface px-6 py-4 toast-root">
						<Toast.Title>
							<Heading2 class="!pt-0">{toast().title}</Heading2>
						</Toast.Title>
						<Toast.Description>
							<Paragraph class="!pt-0">{toast().description}</Paragraph>
						</Toast.Description>
					</Toast.Root>
				)}
			</Toaster>
		</Portal>
	);
}

export const toast = {
	success: (desc: string, options?: ToastParams) => createToast(desc, "success", options),
	error: (desc: string, options?: ToastParams) => createToast(desc, "error", options),
	info: (desc: string, options?: ToastParams) => createToast(desc, "info", options),
	loading: (desc: string, options?: ToastParams) => createToast(desc, "loading", options),
};
