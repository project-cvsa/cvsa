import Menu, { type MenuItem } from "@components/ui/Menu";
import { toast, ToastContainer } from "@components/ui/Toast";
import { getComponentT } from "@lib/i18n/isomorphic";
import Eye from "lucide-solid/icons/eye";
import Search from "lucide-solid/icons/search";
import X from "lucide-solid/icons/x";

export function MenuShowcase() {
	const t = getComponentT("design-system");

	const actionItems: MenuItem[] = [
		{
			value: "search",
			label: t("menus.item.search"),
			icon: Search,
			shortcut: "⌘ K",
		},
		{
			value: "preview",
			label: t("menus.item.preview"),
			icon: Eye,
		},
		{
			value: "clear",
			label: t("menus.item.clear"),
			icon: X,
			shortcut: "⌘ R",
			separatorBefore: true,
		},
	];

	const viewItems: MenuItem[] = [
		{ value: "list", label: t("menus.item.list") },
		{ value: "compact", label: t("menus.item.compact"), shortcut: "⌘ 1" },
		{
			value: "advanced",
			label: t("menus.item.advanced"),
			disabled: true,
			separatorBefore: true,
		},
	];

	const notifyAction = (value: string) => {
		const messages: Record<string, string> = {
			search: t("menus.feedback.search"),
			preview: t("menus.feedback.preview"),
			clear: t("menus.feedback.clear"),
		};
		toast.info(messages[value] ?? t("menus.feedback.default"));
	};

	const notifyView = (value: string) => {
		const messages: Record<string, string> = {
			list: t("menus.feedback.list"),
			compact: t("menus.feedback.compact"),
			advanced: t("menus.feedback.advanced"),
		};
		toast.info(messages[value] ?? t("menus.feedback.default"));
	};

	return (
		<>
			<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
				<div class="flex flex-col items-start gap-2">
					<span class="ts-caption text-tertiary">{t("menus.actionsLabel")}</span>
					<Menu
						label={t("menus.actionTrigger")}
						items={actionItems}
						onSelect={notifyAction}
					/>
				</div>
				<div class="flex flex-col items-start gap-2">
					<span class="ts-caption text-tertiary">{t("menus.viewsLabel")}</span>
					<Menu
						size="sm"
						label={t("menus.viewTrigger")}
						items={viewItems}
						onSelect={notifyView}
					/>
				</div>
			</div>
			<ToastContainer />
		</>
	);
}
