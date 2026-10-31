import { cn } from "@lib/cn";
import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-solid";
import { For, Show, splitProps } from "solid-js";
import Badge from "./Badge";

const tabVariants = cva(
	"group inline-flex items-center gap-2 whitespace-nowrap border-b-2 uppercase font-semibold transition-all select-none shrink-0 cursor-pointer",
	{
		variants: {
			size: {
				sm: "px-3 py-2 text-caption tracking-caption",
				md: "px-4 py-3 text-label tracking-label",
			},
		},
		defaultVariants: {
			size: "md",
		},
	}
);

type TabSize = NonNullable<VariantProps<typeof tabVariants>["size"]>;

export interface TabItem<T extends string = string> {
	id: T;
	label: string;
	count?: number;
	icon?: LucideIcon;
	disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
	items: ReadonlyArray<TabItem<T>> | TabItem<T>[];
	value: T;
	onChange: (value: T) => void;
	class?: string;
	size?: TabSize;
}

export default function Tabs<T extends string = string>(props: TabsProps<T>) {
	const [local, rest] = splitProps(props, ["items", "value", "onChange", "class", "size"]);

	const size = () => local.size ?? "md";

	return (
		<div
			class={cn(
				"flex items-center justify-start w-full gap-1 border-b border-border overflow-x-auto no-scrollbar",
				local.class
			)}
			role="tablist"
			{...rest}
		>
			<For each={local.items}>
				{(item) => {
					const active = () => local.value === item.id;
					return (
						<button
							type="button"
							role="tab"
							aria-selected={active()}
							disabled={item.disabled}
							onClick={() => local.onChange(item.id)}
							class={cn(
								tabVariants({ size: size() }),
								active()
									? "border-primary text-primary"
									: "border-transparent text-secondary hover:text-primary hover:border-border",
								item.disabled && "opacity-50 cursor-not-allowed"
							)}
						>
							<Show when={item.icon}>
								{(Icon) => {
									const IconComp = Icon();
									return (
										<IconComp
											class={cn(
												"w-4 h-4 transition-colors",
												active()
													? "text-primary"
													: "text-tertiary group-hover:text-secondary"
											)}
										/>
									);
								}}
							</Show>
							<span>{item.label}</span>
							<Show when={typeof item.count === "number"}>
								<Badge
									size="sm"
									variant={active() ? "default" : "neutral"}
									class="ml-1 px-1.5"
								>
									{item.count}
								</Badge>
							</Show>
						</button>
					);
				}}
			</For>
		</div>
	);
}
