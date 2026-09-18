import Menu, { type MenuItem } from "@components/ui/Menu";
import { apiRequest } from "@lib/api";
import { createSignal } from "solid-js";
import Home from "lucide-solid/icons/home";
import LogIn from "lucide-solid/icons/log-in";
import LogOut from "lucide-solid/icons/log-out";
import MenuIcon from "lucide-solid/icons/menu";
import UserRound from "lucide-solid/icons/user-round";
import UserPlus from "lucide-solid/icons/user-plus";

export interface HeaderMenuProps {
	label: string;
	homeLabel: string;
	loginLabel: string;
	registerLabel: string;
	logoutLabel: string;
	userName: string | null;
	userAvatarUrl: string | null;
}

const HOME_VALUE = "home";
const PROFILE_VALUE = "profile";
const LOGIN_VALUE = "login";
const REGISTER_VALUE = "register";
const LOGOUT_VALUE = "logout";

export default function HeaderMenu(props: HeaderMenuProps) {
	const [submitting, setSubmitting] = createSignal(false);

	const items = (): MenuItem[] => [
		...(props.userName
			? [
					{
						value: PROFILE_VALUE,
						label: props.userName,
						icon: UserRound,
						avatarUrl: props.userAvatarUrl,
					},
					{
						value: HOME_VALUE,
						label: props.homeLabel,
						icon: Home,
					},
					{
						value: LOGOUT_VALUE,
						label: props.logoutLabel,
						icon: LogOut,
					},
				]
			: [
					{
						value: HOME_VALUE,
						label: props.homeLabel,
						icon: Home,
					},
					{
						value: LOGIN_VALUE,
						label: props.loginLabel,
						icon: LogIn,
					},
					{
						value: REGISTER_VALUE,
						label: props.registerLabel,
						icon: UserPlus,
					},
				]),
	];

	const handleSelect = async (value: string) => {
		if (value === HOME_VALUE) {
			window.location.assign("/");
			return;
		}

		if (value === PROFILE_VALUE) {
			window.location.assign("/profile");
			return;
		}

		if (value === LOGIN_VALUE) {
			window.location.assign("/login");
			return;
		}

		if (value === REGISTER_VALUE) {
			window.location.assign("/register");
			return;
		}

		if (value !== LOGOUT_VALUE || submitting()) return;

		setSubmitting(true);
		await apiRequest("DELETE", "/v2/session");
		window.location.reload();
	};

	return (
		<Menu
			label={props.label}
			items={items()}
			placement="bottom-end"
			triggerIcon={MenuIcon}
			iconOnly
			disabled={submitting()}
			onSelect={handleSelect}
		/>
	);
}
