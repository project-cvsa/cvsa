import List, { type ListItem } from "@components/ui/List";
import { toast, ToastContainer } from "@components/ui/Toast";
import { getComponentT } from "@lib/i18n/isomorphic";
import { createSignal } from "solid-js";
import Eye from "lucide-solid/icons/eye";
import Music2 from "lucide-solid/icons/music-2";
import Pencil from "lucide-solid/icons/pencil";
import Trash from "lucide-solid/icons/trash";

export function ListShowcase() {
	const t = getComponentT("design-system");
	const commonActions = [
		{ value: "preview", label: t("lists.action.preview"), icon: Eye },
		{ value: "edit", label: t("lists.action.edit"), icon: Pencil },
		{
			value: "remove",
			label: t("lists.action.remove"),
			icon: Trash,
			separatorBefore: true,
		},
	];
	const initialItems: ListItem[] = [
		{
			id: "1",
			title: t("lists.item.1.title"),
			description: t("lists.item.1.description"),
			metadata: "03:20",
			icon: Music2,
			actions: commonActions,
		},
		{
			id: "2",
			title: t("lists.item.2.title"),
			description: t("lists.item.2.description"),
			metadata: "04:02",
			icon: Music2,
			actions: commonActions,
		},
		{
			id: "3",
			title: t("lists.item.3.title"),
			description: t("lists.item.3.description"),
			metadata: "02:48",
			icon: Music2,
			actions: commonActions,
		},
	];
	const [items, setItems] = createSignal(initialItems);

	return (
		<>
			<List
				items={items()}
				ariaLabel={t("lists.label")}
				reorderable
				dragLabel={(item) => t("lists.drag", { title: item.title })}
				actionLabel={(item) => t("lists.actions", { title: item.title })}
				onReorder={(nextItems) => setItems([...nextItems])}
				onSelect={(item) => toast.info(t("lists.feedback.open", { title: item.title }))}
				onAction={(item, action) =>
					toast.info(t("lists.feedback.action", { title: item.title, action }))
				}
			/>
			<ToastContainer />
		</>
	);
}
