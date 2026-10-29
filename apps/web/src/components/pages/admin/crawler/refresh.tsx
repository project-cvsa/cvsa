import {
	createContext,
	createEffect,
	on,
	onMount,
	useContext,
	type Accessor,
	type ParentProps,
} from "solid-js";

export type CrawlerSection =
	| "overview"
	| "discovery"
	| "labeling"
	| "network"
	| "videos"
	| "tasks"
	| "settings";
type RefreshState = { section: Accessor<CrawlerSection>; revision: Accessor<number> };
const RefreshContext = createContext<RefreshState>();

export function CrawlerRefreshProvider(props: ParentProps<RefreshState>) {
	return <RefreshContext.Provider value={props}>{props.children}</RefreshContext.Provider>;
}

/** One page clock refreshes only the visible section; local edits keep their own dirty guard. */
export function useCrawlerRefresh(section: CrawlerSection, refresh: () => void) {
	const state = useContext(RefreshContext);
	if (!state) {
		onMount(refresh);
		return;
	}
	createEffect(
		on([state.section, state.revision], ([current]) => {
			if (current === section) refresh();
		})
	);
}
