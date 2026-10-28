import { getComponentT } from "@lib/i18n/isomorphic";
import "./CompactControlsProposal.css";

export default function CompactControlsProposal() {
	const t = getComponentT("design-system");
	return (
		<div class="compact-proposal">
			<p>{t("proposal.description")}</p>
			<div class="compact-proposal__row">
				<label class="compact-proposal__field">
					<span>{t("proposal.search")}</span>
					<input placeholder={t("proposal.search")} />
				</label>
				<label class="compact-proposal__field">
					<span>{t("proposal.depth")}</span>
					<select>
						<option value="1">{t("proposal.onePage")}</option>
						<option value="2" selected>
							{t("proposal.twoPages")}
						</option>
						<option value="3">{t("proposal.threePages")}</option>
					</select>
				</label>
				<button type="button">{t("proposal.action")}</button>
			</div>
			<div>
				<p>{t("proposal.unlabeledDescription")}</p>
				<div class="compact-proposal__row">
					<select aria-label={t("proposal.depth")}>
						<option value="1">{t("proposal.onePage")}</option>
						<option value="2" selected>
							{t("proposal.twoPages")}
						</option>
						<option value="3">{t("proposal.threePages")}</option>
					</select>
				</div>
			</div>
			<div class="compact-proposal__dialog">
				<div>
					<strong>{t("proposal.dialogTitle")}</strong>
					<p>{t("proposal.dialogDescription")}</p>
				</div>
				<div class="compact-proposal__dialog-actions">
					<button type="button">{t("proposal.cancel")}</button>
					<button type="button">{t("proposal.save")}</button>
				</div>
			</div>
		</div>
	);
}
