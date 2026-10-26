import Button from "@components/ui/Button";
import { toast, ToastContainer } from "@components/ui/Toast";
import { getComponentT } from "@lib/i18n/isomorphic";

export function ButtonVariants() {
	const t = getComponentT("design-system");

	return (
		<>
			<Button variant="filled" onclick={() => toast.info(t("buttons.variant.filledToast"))}>
				{t("buttons.variant.filled")}
			</Button>
			<Button
				variant="outlined"
				onclick={() => toast.info(t("buttons.variant.outlinedToast"))}
			>
				{t("buttons.variant.outlined")}
			</Button>
			<Button variant="ghost" onclick={() => toast.info(t("buttons.variant.ghostToast"))}>
				{t("buttons.variant.ghost")}
			</Button>
			<ToastContainer />
		</>
	);
}

export function ButtonSizes() {
	const t = getComponentT("design-system");

	return (
		<>
			<Button size="sm" onclick={() => toast.info(t("buttons.size.smallToast"))}>
				{t("buttons.size.small")}
			</Button>
			<Button size="md" onclick={() => toast.info(t("buttons.size.mediumToast"))}>
				{t("buttons.size.medium")}
			</Button>
			<Button size="lg" onclick={() => toast.info(t("buttons.size.largeToast"))}>
				{t("buttons.size.large")}
			</Button>
			<ToastContainer />
		</>
	);
}
