import TextField from "@components/ui/TextField";
import { getComponentT } from "@lib/i18n/isomorphic";

export function TextFieldShowcase() {
	const t = getComponentT("design-system");
	return (
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<TextField label={t("fields.account")} value="alikia2x@outlook.com" />
			<TextField
				label={t("fields.password")}
				type="password"
				helperText={t("fields.passwordHelper")}
			/>
			<TextField label={t("fields.email")} type="email" required />
			<TextField placeholder={t("fields.usernamePlaceholder")} />
			<TextField
				defaultValue={t("fields.searchValue")}
				leadingIcon="search"
				trailingIcon="clear"
				aria-label={t("fields.searchAriaLabel")}
				clearLabel={t("fields.clearLabel")}
			/>
			<TextField
				size="sm"
				placeholder={t("fields.searchLabel")}
				aria-label={t("fields.searchLabel")}
			/>
			<TextField
				size="lg"
				placeholder={t("fields.searchPlaceholder")}
				aria-label={t("fields.searchAriaLabel")}
			/>
			<TextField
				label={t("fields.unavailable")}
				value={t("fields.unavailableValue")}
				disabled
			/>
			<TextField
				label={t("fields.email")}
				value="example"
				errorText={t("fields.invalidEmailError")}
			/>
		</div>
	);
}
